"""SHOPbakēd module (Slice 1 — Foundation, 2026-02).

Marketplace for fashion, electronics, home goods with variant-heavy
listings. This slice only scaffolds the router surface — real listing,
search, cart and PDP endpoints land in Slices 2-6.
"""
from modules.shop.routes import (
    public_router,
    portal_router,
    admin_router,
)

__all__ = ["public_router", "portal_router", "admin_router"]
