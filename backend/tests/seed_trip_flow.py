"""Seed helper for iteration 63 — creates an in-flight ExpressBooking
assigned to the given SENDbakēd driver so the DriverTripSheet can be tested
end-to-end.

Idempotent: safe to re-run. Returns the booking id + driver JWT via the API.
"""
import os, sys, asyncio, json
from datetime import datetime, timezone
from sqlalchemy import text

sys.path.insert(0, "/app/backend")
from core.db import engine  # noqa: E402


async def main(phone: str = "+919990001234"):
    async with engine.begin() as conn:
        # 1) driver row
        row = (await conn.execute(text(
            "SELECT id, country FROM drivers WHERE phone_e164 = :p"), {"p": phone})).first()
        if not row:
            print("driver row missing for", phone); return
        driver_id, country = row
        # ensure approved + online
        await conn.execute(text("""
            UPDATE drivers
               SET status='approved', kyc_step='done', is_online=true,
                   current_lat=12.9716, current_lng=77.5946,
                   last_seen_at=now(), approved_at=COALESCE(approved_at, now()),
                   vehicle_type=COALESCE(vehicle_type,'bike'),
                   name=COALESCE(name,'Trip Test Driver')
             WHERE id=:id"""), {"id": driver_id})

        # 2) customer
        cust = (await conn.execute(text(
            "SELECT id FROM customers WHERE email='trip.customer@baked.dev'"))).first()
        if cust:
            cust_id = cust[0]
        else:
            cust_id = "cus_trip_test_seed"
            await conn.execute(text("""
                INSERT INTO customers(id,email,name,role,auth_providers,country,verified,reward_points,preferences,version)
                VALUES(:id,'trip.customer@baked.dev','Trip Customer','customer',ARRAY['email']::varchar[],:c,true,0,'{}'::jsonb,1)
                ON CONFLICT (id) DO NOTHING
            """), {"id": cust_id, "c": country})

        # 3) module_driver
        md = (await conn.execute(text(
            "SELECT id FROM module_drivers WHERE linked_driver_id=:d"), {"d": driver_id})).first()
        if md:
            md_id = md[0]
        else:
            md_id = "drv_md_trip_test"
            await conn.execute(text("""
                INSERT INTO module_drivers(id,module,name,phone,country,vehicle_type,
                    is_available,linked_driver_id,status,rating,version)
                VALUES(:id,'express','Trip Test Driver',:p,:c,'bike',true,:d,'active',4.9,1)
                ON CONFLICT (id) DO UPDATE SET linked_driver_id=EXCLUDED.linked_driver_id
            """), {"id": md_id, "p": phone+"_md", "c": country, "d": driver_id})

        # 4) existing in-flight booking?
        existing = (await conn.execute(text("""
            SELECT id, status FROM express_bookings
             WHERE driver_id=:m AND status IN ('driver_assigned','arriving','picked_up','in_transit')
             ORDER BY created_at DESC LIMIT 1"""), {"m": md_id})).first()
        if existing:
            # reset to driver_assigned for clean retest
            await conn.execute(text(
                "UPDATE express_bookings SET status='driver_assigned' WHERE id=:i"),
                {"i": existing[0]})
            booking_id = existing[0]
        else:
            booking_id = "exp_trip_test_seed"
            await conn.execute(text("""
                INSERT INTO express_bookings(
                    id, ref, customer_id, module, booking_type, country, status, payment_status,
                    currency, currency_symbol, total, vehicle_code,
                    pickup_line1, pickup_latitude, pickup_longitude, pickup_formatted_address, pickup_building,
                    drop_line1, drop_latitude, drop_longitude, drop_formatted_address, drop_building,
                    receiver_name, receiver_phone, receiver_preferences,
                    distance_km, duration_min, driver_id, declined_driver_ids)
                VALUES(:id,'EXP-TRIP-SEED',:cust,'express','parcel',:c,'driver_assigned','pending',
                       'INR','₹',180,'bike',
                       'Merchant Shop, MG Rd',12.9716,77.5946,'MG Road, Bengaluru','Shop 12',
                       'Recipient Home, Indiranagar',12.9784,77.6408,'Indiranagar, Bengaluru','Apt 42B',
                       'Recipient Test','+919990009999',ARRAY[]::varchar[],
                       6.4,18,:m,'[]'::jsonb)
                ON CONFLICT (id) DO UPDATE SET status='driver_assigned', driver_id=:m
            """), {"id": booking_id, "cust": cust_id, "c": country, "m": md_id})

        # 5) link active_booking_id
        await conn.execute(text(
            "UPDATE module_drivers SET active_booking_id=:b WHERE id=:m"),
            {"b": booking_id, "m": md_id})

        print(json.dumps({"driver_id": driver_id, "module_driver_id": md_id,
                          "booking_id": booking_id, "customer_id": cust_id}))


if __name__ == "__main__":
    asyncio.run(main())
