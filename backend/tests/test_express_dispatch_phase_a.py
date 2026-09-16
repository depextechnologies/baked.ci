"""SENDbakēd Phase-A Dispatch — direct-DB pytest suite.

Covers the algorithmic contracts of `modules.express.dispatch`:
    * `find_nearest_driver`
    * `dispatch_next_offer`
    * `accept_offer_atomic`
    * `decline_offer`

Rationale for direct-DB tests (vs. HTTP): the dispatch layer's contract
lives entirely in Postgres state transitions — offer_expires_at, atomic
UPDATE .. WHERE races, `declined_driver_ids` accretion, freshness gates,
refrigerated cold-chain guarantees. Hitting them through the /api/driver
surface would require a full KYC + approve fixture per scenario and
would drown the actual assertions in setup.

Each test seeds only what it needs, exercises one scenario, and cleans
up. All rows are namespaced with a per-run uuid so parallel runs don't
collide and a partial failure leaves nothing behind.

Run: `pytest -xvs backend/tests/test_express_dispatch_phase_a.py`
"""
from __future__ import annotations

import asyncio
import os
import uuid
from datetime import datetime, timedelta, timezone

import pytest
import pytest_asyncio
from sqlalchemy import delete, select, update
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

# Import module state and the callables under test.
from modules.express import dispatch as dispatch_mod
from modules.express.dispatch import (
    FALLBACK_CHAIN,
    REFRIGERATED_CODES,
    accept_offer_atomic,
    decline_offer,
    dispatch_next_offer,
    find_nearest_driver,
)

DB_URL = (
    os.environ.get("DATABASE_URL")
    or os.environ.get("SUPABASE_DB_URL")
    or os.environ.get("POSTGRES_URL")
)


# ---------------------------------------------------------------------------
# Session fixture
# ---------------------------------------------------------------------------


@pytest_asyncio.fixture
async def db_session():
    if not DB_URL:
        pytest.skip("DATABASE_URL not set — running outside test-DB context")
    engine = create_async_engine(DB_URL, future=True)
    Session = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)
    async with Session() as s:
        yield s
    await engine.dispose()


# ---------------------------------------------------------------------------
# Seed helpers — every row is stamped with a run-scoped tag so `teardown`
# can wipe them in one shot even if a mid-test exception skips explicit
# cleanup.
# ---------------------------------------------------------------------------


TAG = f"disp_phaseA_{uuid.uuid4().hex[:8]}"


def _dtag(suffix: str = "") -> str:
    return f"{TAG}_{suffix}_{uuid.uuid4().hex[:6]}"


async def _seed_customer(session: AsyncSession, country: str = "CI") -> str:
    from core.models import Customer

    cust = Customer(
        id=_dtag("cust"),
        phone=f"+225{uuid.uuid4().hex[:10]}",
        email=f"{_dtag('e')}@baked.dev",
        name=f"QA Dispatch {TAG}",
        country=country,
        role="customer",
        verified=True,
    )
    session.add(cust)
    await session.flush()
    return cust.id


async def _seed_driver(
    session: AsyncSession,
    *,
    country: str = "CI",
    vehicle: str = "bike",
    lat: float = 5.35,
    lng: float = -4.02,
    linked: bool = True,
    fresh: bool = True,
    is_refrigerated: bool = False,
    is_available: bool = True,
    status: str = "active",
) -> str:
    """Create a ModuleDriver row shaped for the dispatch query.

    `linked=False` reproduces the legacy seed rows Phase A excludes.
    `fresh=False` places `last_seen_at` outside the freshness window so
    the driver is a stale entry the dispatcher should skip.
    """
    from core.models import Driver, ModuleDriver

    now = datetime.now(timezone.utc)
    linked_id = None
    if linked:
        # Create a minimal SENDbakēd Driver so `linked_driver_id` points
        # at a real row (FK is ON DELETE SET NULL, but presence still
        # matters for the "real drivers only" filter).
        drv = Driver(
            id=_dtag("d"),
            phone_e164=f"+225{uuid.uuid4().hex[:10]}",
            country=country,
            status="approved",
            is_online=True,
        )
        session.add(drv)
        await session.flush()
        linked_id = drv.id

    md = ModuleDriver(
        id=_dtag("md"),
        module="express",
        name=f"Dispatch QA {TAG}",
        phone=f"drv:{uuid.uuid4().hex[:12]}",
        country=country,
        vehicle_type=vehicle,
        current_lat=lat,
        current_lng=lng,
        is_available=is_available,
        is_refrigerated=is_refrigerated,
        linked_driver_id=linked_id,
        last_seen_at=(now - timedelta(seconds=10)) if fresh else (now - timedelta(hours=1)),
        status=status,
    )
    session.add(md)
    await session.flush()
    return md.id


async def _seed_booking(
    session: AsyncSession,
    customer_id: str,
    *,
    vehicle: str = "bike",
    country: str = "CI",
    pickup_lat: float = 5.35,
    pickup_lng: float = -4.02,
) -> str:
    from core.models import ExpressBooking

    b = ExpressBooking(
        id=_dtag("b"),
        ref=f"REF-{uuid.uuid4().hex[:10].upper()}",
        customer_id=customer_id,
        module="express",
        booking_type="parcel",
        country=country,
        status="searching",
        currency="XOF",
        total=1000,
        vehicle_code=vehicle,
        pickup_latitude=pickup_lat,
        pickup_longitude=pickup_lng,
        drop_latitude=pickup_lat + 0.05,
        drop_longitude=pickup_lng + 0.05,
    )
    session.add(b)
    await session.flush()
    return b.id


async def _cleanup(session: AsyncSession):
    """Purge every row this suite ever created (tagged by TAG prefix)."""
    from core.models import (
        Customer,
        Driver,
        ExpressBooking,
        ExpressBookingTimeline,
        ModuleDriver,
    )

    # Order matters: children first, then FK parents. Bookings reference
    # module_drivers via offered_to_driver_id and driver_id, so nul those
    # out before deleting either side.
    await session.execute(
        update(ExpressBooking)
        .where(ExpressBooking.id.startswith(TAG))
        .values(offered_to_driver_id=None, driver_id=None)
    )
    await session.execute(
        update(ModuleDriver)
        .where(ModuleDriver.id.startswith(TAG))
        .values(active_booking_id=None)
    )
    await session.execute(
        delete(ExpressBookingTimeline).where(ExpressBookingTimeline.booking_id.startswith(TAG))
    )
    await session.execute(delete(ExpressBooking).where(ExpressBooking.id.startswith(TAG)))
    await session.execute(delete(ModuleDriver).where(ModuleDriver.id.startswith(TAG)))
    await session.execute(delete(Driver).where(Driver.id.startswith(TAG)))
    await session.execute(delete(Customer).where(Customer.id.startswith(TAG)))
    await session.commit()


@pytest_asyncio.fixture
async def clean(db_session):
    """Yield the session, wipe test-tagged rows on teardown."""
    try:
        yield db_session
    finally:
        try:
            await _cleanup(db_session)
        except Exception:
            await db_session.rollback()
            await _cleanup(db_session)


# ---------------------------------------------------------------------------
# find_nearest_driver — matching rules
# ---------------------------------------------------------------------------


class TestFindNearestDriver:
    @pytest.mark.asyncio
    async def test_returns_nearest_online_driver_within_radius(self, clean):
        s = clean
        near_id = await _seed_driver(s, lat=5.36, lng=-4.03)  # very close
        far_id  = await _seed_driver(s, lat=5.30, lng=-4.10)  # further away
        await s.commit()

        picked = await find_nearest_driver(s, country="CI", vehicle_code="bike",
                                            pickup_lat=5.36, pickup_lng=-4.03)
        assert picked is not None
        assert picked.id == near_id
        assert picked.id != far_id

    @pytest.mark.asyncio
    async def test_excludes_legacy_seed_rows_without_linked_driver_id(self, clean):
        s = clean
        # A "legacy seed" driver (no linked_driver_id) is right next door.
        _legacy = await _seed_driver(s, lat=5.35, lng=-4.02, linked=False)
        # A real driver a bit further out.
        real = await _seed_driver(s, lat=5.40, lng=-4.05, linked=True)
        await s.commit()

        picked = await find_nearest_driver(s, country="CI", vehicle_code="bike",
                                            pickup_lat=5.35, pickup_lng=-4.02)
        assert picked is not None, "expected the real driver to be matched"
        assert picked.id == real

    @pytest.mark.asyncio
    async def test_excludes_stale_drivers(self, clean):
        s = clean
        stale = await _seed_driver(s, lat=5.35, lng=-4.02, fresh=False)
        fresh = await _seed_driver(s, lat=5.40, lng=-4.05, fresh=True)
        await s.commit()

        picked = await find_nearest_driver(s, country="CI", vehicle_code="bike",
                                            pickup_lat=5.35, pickup_lng=-4.02)
        assert picked is not None
        assert picked.id == fresh
        assert picked.id != stale

    @pytest.mark.asyncio
    async def test_excludes_unavailable_drivers(self, clean):
        s = clean
        _busy = await _seed_driver(s, lat=5.35, lng=-4.02, is_available=False)
        free  = await _seed_driver(s, lat=5.40, lng=-4.05, is_available=True)
        await s.commit()

        picked = await find_nearest_driver(s, country="CI", vehicle_code="bike",
                                            pickup_lat=5.35, pickup_lng=-4.02)
        assert picked is not None
        assert picked.id == free

    @pytest.mark.asyncio
    async def test_excludes_drivers_outside_match_radius(self, clean, monkeypatch):
        s = clean
        # Shrink the radius so far_id is effectively unreachable.
        monkeypatch.setattr(dispatch_mod, "MATCH_RADIUS_KM", 1.0)
        _far = await _seed_driver(s, lat=6.00, lng=-4.02)  # ~72 km away
        await s.commit()

        picked = await find_nearest_driver(s, country="CI", vehicle_code="bike",
                                            pickup_lat=5.35, pickup_lng=-4.02)
        assert picked is None

    @pytest.mark.asyncio
    async def test_exclude_ids_are_honoured(self, clean):
        s = clean
        near = await _seed_driver(s, lat=5.36, lng=-4.03)
        alt  = await _seed_driver(s, lat=5.40, lng=-4.05)
        await s.commit()

        picked = await find_nearest_driver(s, country="CI", vehicle_code="bike",
                                            pickup_lat=5.36, pickup_lng=-4.03,
                                            exclude_ids=[near])
        assert picked is not None
        assert picked.id == alt

    @pytest.mark.asyncio
    async def test_country_filter_isolates_markets(self, clean):
        s = clean
        _in_ci = await _seed_driver(s, country="CI", lat=5.36, lng=-4.03)
        await s.commit()

        # Query for a country where we didn't seed any drivers.
        picked = await find_nearest_driver(s, country="IN", vehicle_code="bike",
                                            pickup_lat=5.36, pickup_lng=-4.03)
        assert picked is None


# ---------------------------------------------------------------------------
# find_nearest_driver — vehicle fallback chain + cold-chain guarantee
# ---------------------------------------------------------------------------


class TestVehicleFallbackChain:
    @pytest.mark.asyncio
    async def test_bike_falls_back_to_scooter(self, clean):
        s = clean
        assert FALLBACK_CHAIN["bike"][1] == "scooter"
        scooter = await _seed_driver(s, vehicle="scooter", lat=5.36, lng=-4.03)
        await s.commit()

        picked = await find_nearest_driver(s, country="CI", vehicle_code="bike",
                                            pickup_lat=5.36, pickup_lng=-4.03)
        assert picked is not None
        assert picked.id == scooter

    @pytest.mark.asyncio
    async def test_three_wheeler_prefers_own_type_over_fallback(self, clean):
        s = clean
        own = await _seed_driver(s, vehicle="three_wheeler", lat=5.40, lng=-4.05)
        _mini = await _seed_driver(s, vehicle="mini_truck", lat=5.36, lng=-4.03)  # closer, but fallback
        await s.commit()

        picked = await find_nearest_driver(s, country="CI", vehicle_code="three_wheeler",
                                            pickup_lat=5.36, pickup_lng=-4.03)
        assert picked is not None
        # own-type family is scanned first, so `own` wins even though further.
        assert picked.id == own

    @pytest.mark.asyncio
    async def test_ref_tricycle_never_falls_back_to_non_refrigerated(self, clean):
        s = clean
        # Only non-refrigerated drivers available — no match should happen.
        _bike = await _seed_driver(s, vehicle="bike",     lat=5.36, lng=-4.03, is_refrigerated=False)
        _cool = await _seed_driver(s, vehicle="ref_truck", lat=5.40, lng=-4.05, is_refrigerated=False)
        await s.commit()

        picked = await find_nearest_driver(s, country="CI", vehicle_code="ref_tricycle",
                                            pickup_lat=5.36, pickup_lng=-4.03)
        assert picked is None, (
            "ref_tricycle jobs must never dispatch to a driver whose "
            "is_refrigerated flag is False, regardless of vehicle_type."
        )

    @pytest.mark.asyncio
    async def test_ref_tricycle_falls_back_to_ref_utility(self, clean):
        s = clean
        assert set(FALLBACK_CHAIN["ref_tricycle"]) == {"ref_tricycle", "ref_utility", "ref_truck"}
        util = await _seed_driver(
            s, vehicle="ref_utility", lat=5.36, lng=-4.03, is_refrigerated=True,
        )
        await s.commit()

        picked = await find_nearest_driver(s, country="CI", vehicle_code="ref_tricycle",
                                            pickup_lat=5.36, pickup_lng=-4.03)
        assert picked is not None
        assert picked.id == util

    @pytest.mark.asyncio
    async def test_refrigerated_code_set_matches_module_expectation(self):
        # Guard against accidental broadening of the cold-chain guarantee.
        assert REFRIGERATED_CODES == {"ref_tricycle", "ref_utility", "ref_truck"}


# ---------------------------------------------------------------------------
# dispatch_next_offer — state transitions on the booking row
# ---------------------------------------------------------------------------


class TestDispatchNextOffer:
    @pytest.mark.asyncio
    async def test_offer_state_persisted_when_driver_available(self, clean):
        s = clean
        cust = await _seed_customer(s)
        drv  = await _seed_driver(s, lat=5.36, lng=-4.03)
        bid  = await _seed_booking(s, cust, pickup_lat=5.36, pickup_lng=-4.03)
        await s.commit()

        from core.models import ExpressBooking

        booking = await s.get(ExpressBooking, bid)
        offered = await dispatch_next_offer(s, booking)
        await s.commit()

        assert offered is not None
        assert offered.id == drv
        booking = await s.get(ExpressBooking, bid)
        assert booking.status == "offering"
        assert booking.offered_to_driver_id == drv
        assert booking.offered_at is not None
        assert booking.offer_expires_at is not None
        assert booking.offer_expires_at > datetime.now(timezone.utc)

    @pytest.mark.asyncio
    async def test_exhausted_pool_returns_status_to_searching(self, clean):
        s = clean
        cust = await _seed_customer(s)
        bid  = await _seed_booking(s, cust, pickup_lat=5.36, pickup_lng=-4.03)
        # Seed no drivers; force back-to-searching.
        await s.commit()

        from core.models import ExpressBooking

        booking = await s.get(ExpressBooking, bid)
        offered = await dispatch_next_offer(s, booking)
        await s.commit()

        assert offered is None
        booking = await s.get(ExpressBooking, bid)
        assert booking.status == "searching"
        assert booking.offered_to_driver_id is None
        assert booking.offer_expires_at is None

    @pytest.mark.asyncio
    async def test_declined_ids_are_skipped_on_next_dispatch(self, clean):
        s = clean
        cust = await _seed_customer(s)
        drv1 = await _seed_driver(s, lat=5.36, lng=-4.03)          # closer
        drv2 = await _seed_driver(s, lat=5.40, lng=-4.05)          # farther fallback
        bid  = await _seed_booking(s, cust, pickup_lat=5.36, pickup_lng=-4.03)
        # First dispatch to drv1, then decline and re-dispatch.
        from core.models import ExpressBooking

        booking = await s.get(ExpressBooking, bid)
        booking.declined_driver_ids = [drv1]
        await s.commit()

        booking = await s.get(ExpressBooking, bid)
        offered = await dispatch_next_offer(s, booking)
        await s.commit()

        assert offered is not None
        assert offered.id == drv2, "declined driver must be skipped"


# ---------------------------------------------------------------------------
# accept_offer_atomic — race semantics + failure reasons
# ---------------------------------------------------------------------------


class TestAcceptOfferAtomic:
    @pytest.mark.asyncio
    async def test_correct_driver_wins_and_reserves_module_driver(self, clean):
        s = clean
        cust = await _seed_customer(s)
        drv  = await _seed_driver(s, lat=5.36, lng=-4.03)
        bid  = await _seed_booking(s, cust, pickup_lat=5.36, pickup_lng=-4.03)
        await s.commit()

        from core.models import ExpressBooking, ModuleDriver

        booking = await s.get(ExpressBooking, bid)
        await dispatch_next_offer(s, booking)
        await s.commit()

        ok, reason = await accept_offer_atomic(s, bid, drv)
        await s.commit()

        assert ok is True
        assert reason == "ok"
        booking = await s.get(ExpressBooking, bid)
        assert booking.status == "driver_assigned"
        assert booking.driver_id == drv
        md = await s.get(ModuleDriver, drv)
        assert md.is_available is False
        assert md.active_booking_id == bid

    @pytest.mark.asyncio
    async def test_expired_offer_is_rejected(self, clean):
        s = clean
        cust = await _seed_customer(s)
        drv  = await _seed_driver(s, lat=5.36, lng=-4.03)
        bid  = await _seed_booking(s, cust, pickup_lat=5.36, pickup_lng=-4.03)
        await s.commit()

        from core.models import ExpressBooking

        booking = await s.get(ExpressBooking, bid)
        await dispatch_next_offer(s, booking)
        # Force the offer into the past.
        booking = await s.get(ExpressBooking, bid)
        booking.offer_expires_at = datetime.now(timezone.utc) - timedelta(seconds=5)
        await s.commit()

        ok, reason = await accept_offer_atomic(s, bid, drv)
        assert ok is False
        assert reason == "expired"

    @pytest.mark.asyncio
    async def test_wrong_driver_gets_offer_gone(self, clean):
        s = clean
        cust = await _seed_customer(s)
        drv1 = await _seed_driver(s, lat=5.36, lng=-4.03)
        drv2 = await _seed_driver(s, lat=5.40, lng=-4.05)
        bid  = await _seed_booking(s, cust, pickup_lat=5.36, pickup_lng=-4.03)
        await s.commit()

        from core.models import ExpressBooking

        booking = await s.get(ExpressBooking, bid)
        await dispatch_next_offer(s, booking)      # goes to drv1 (closer)
        await s.commit()

        ok, reason = await accept_offer_atomic(s, bid, drv2)  # imposter
        assert ok is False
        assert reason == "offer_gone"

    @pytest.mark.asyncio
    async def test_already_taken_returns_correct_reason(self, clean):
        s = clean
        cust = await _seed_customer(s)
        drv  = await _seed_driver(s, lat=5.36, lng=-4.03)
        bid  = await _seed_booking(s, cust, pickup_lat=5.36, pickup_lng=-4.03)
        await s.commit()

        from core.models import ExpressBooking

        booking = await s.get(ExpressBooking, bid)
        await dispatch_next_offer(s, booking)
        await s.commit()

        ok, _ = await accept_offer_atomic(s, bid, drv)  # first accept
        await s.commit()
        assert ok is True

        # A second identical accept must be rejected: booking is no
        # longer in status='offering', so the UPDATE .. WHERE hits 0 rows.
        ok2, reason2 = await accept_offer_atomic(s, bid, drv)
        assert ok2 is False
        assert reason2 == "already_taken"


# ---------------------------------------------------------------------------
# Concurrent race — only one driver may win.
# ---------------------------------------------------------------------------


class TestAtomicRace:
    @pytest.mark.asyncio
    async def test_two_drivers_racing_one_wins(self, clean):
        """Two accept_offer_atomic calls in parallel — exactly one succeeds.

        This is the whole reason the accept path is a single UPDATE .. WHERE
        instead of read/check/update. If the guard ever regresses, this
        test flips flaky.
        """
        s = clean
        cust = await _seed_customer(s)
        drv  = await _seed_driver(s, lat=5.36, lng=-4.03)
        # Second driver: not the offered one, but simulates a racing client
        # firing the accept endpoint with mismatched credentials.
        drv2 = await _seed_driver(s, lat=5.40, lng=-4.05)
        bid  = await _seed_booking(s, cust, pickup_lat=5.36, pickup_lng=-4.03)
        await s.commit()

        from core.models import ExpressBooking

        booking = await s.get(ExpressBooking, bid)
        await dispatch_next_offer(s, booking)
        await s.commit()

        # Two concurrent sessions to reproduce a real race.
        engine = create_async_engine(DB_URL, future=True)
        Session = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)

        async def try_accept(driver_id: str):
            async with Session() as sess:
                ok, reason = await accept_offer_atomic(sess, bid, driver_id)
                await sess.commit()
                return ok, reason

        results = await asyncio.gather(try_accept(drv), try_accept(drv2))
        winners = [r for r in results if r[0]]
        assert len(winners) == 1, f"expected exactly one winner, got {results}"

        # Losing side must surface a structured reason (not a crash).
        losers = [r for r in results if not r[0]]
        assert len(losers) == 1
        assert losers[0][1] in {"already_taken", "offer_gone"}

        await engine.dispose()


# ---------------------------------------------------------------------------
# decline_offer — accretion + re-dispatch chain
# ---------------------------------------------------------------------------


class TestDeclineOffer:
    @pytest.mark.asyncio
    async def test_decline_appends_and_re_dispatches(self, clean):
        s = clean
        cust = await _seed_customer(s)
        drv1 = await _seed_driver(s, lat=5.36, lng=-4.03)  # closer
        drv2 = await _seed_driver(s, lat=5.40, lng=-4.05)
        bid  = await _seed_booking(s, cust, pickup_lat=5.36, pickup_lng=-4.03)
        await s.commit()

        from core.models import ExpressBooking

        booking = await s.get(ExpressBooking, bid)
        first = await dispatch_next_offer(s, booking)
        await s.commit()
        assert first is not None and first.id == drv1

        booking = await s.get(ExpressBooking, bid)
        await decline_offer(s, booking, drv1)
        await s.commit()

        booking = await s.get(ExpressBooking, bid)
        assert drv1 in (booking.declined_driver_ids or [])
        # Since drv2 was still available, decline_offer's internal
        # dispatch_next_offer call should have re-offered to drv2.
        assert booking.status == "offering"
        assert booking.offered_to_driver_id == drv2

    @pytest.mark.asyncio
    async def test_decline_all_drivers_falls_back_to_searching(self, clean):
        s = clean
        cust = await _seed_customer(s)
        drv1 = await _seed_driver(s, lat=5.36, lng=-4.03)
        bid  = await _seed_booking(s, cust, pickup_lat=5.36, pickup_lng=-4.03)
        await s.commit()

        from core.models import ExpressBooking

        booking = await s.get(ExpressBooking, bid)
        await dispatch_next_offer(s, booking)
        await s.commit()

        booking = await s.get(ExpressBooking, bid)
        await decline_offer(s, booking, drv1)
        await s.commit()

        booking = await s.get(ExpressBooking, bid)
        assert booking.status == "searching"
        assert booking.offered_to_driver_id is None
