/**
 * SENDbakēd — official brand asset URLs.
 * These are the production-approved renders. Do NOT swap for generated icons.
 * (P0 correction pass: renamed brand from EXPRESSbakēd to SENDbakēd; internal
 *  module identifier `express` is intentionally preserved.)
 */
export const EXPRESS_ASSETS = {
  wordmark: "https://customer-assets-4nw71qhi.emergentagent.net/job_baked-platform/artifacts/odl93m8h_SENDbaked.jpeg",
  bike:     "https://customer-assets-4nw71qhi.emergentagent.net/job_baked-platform/artifacts/kkvj338q_Bike_baked.png",
  threeW:   "https://customer-assets-4nw71qhi.emergentagent.net/job_baked-platform/artifacts/xarw2ocr_3W-baked.png",
  truck:    "https://customer-assets-4nw71qhi.emergentagent.net/job_baked-platform/artifacts/ftc2sme4_Truck_baked.png",
  parcel:   "https://customer-assets-4nw71qhi.emergentagent.net/job_baked-platform/artifacts/zh3bpr0c_Parcel.png",
  moving:   "https://customer-assets-4nw71qhi.emergentagent.net/job_baked-platform/artifacts/2xdp5al4_Home_Shifting.png",
};

/**
 * Phase A — six SEND service tiles.
 * Motorcycle keeps the existing Bike_baked asset (per user brief).
 * The other five images are shipped in /public/send-tiles/*.png so they
 * render offline and can be swapped by ops without a code change.
 */
export const SEND_TILE_ASSETS = {
  moto:          EXPRESS_ASSETS.bike,
  cargo:         "/send-tiles/send_by_cargo.png",
  fresh:         "/send-tiles/fresh_products.png",
  between_cities: "/send-tiles/between_cities.png",
  movers:        "/send-tiles/packers_movers.png",
  multi:         "/send-tiles/multiple_shipments.png",
};

/**
 * Phase C — vehicle catalogue images (per SEND vehicle code).
 * Files live in /public/send-tiles/vehicles/ so ops can hot-swap without a
 * code change. Refrigerated variants reuse the same silhouettes — the
 * "frigorifique" label + refrigerated badge is enough context on the card.
 */
export const VEHICLE_IMAGES = {
  bike:          EXPRESS_ASSETS.bike,
  scooter:       EXPRESS_ASSETS.bike,
  three_wheeler: "/send-tiles/vehicles/tricycle.png",
  mini_truck:    "/send-tiles/vehicles/mini_truck.png",
  truck:         "/send-tiles/vehicles/truck.png",
  // Fresh Products / cold-chain fleet — dedicated refrigerated renders
  // (SENDbakēd-branded reefer bodies) so the card immediately reads as
  // cold chain and cannot be visually confused with the non-refrigerated
  // silhouettes above.
  ref_tricycle:  "/send-tiles/vehicles/ref_tricycle.png",
  ref_utility:   "/send-tiles/vehicles/ref_utility.png",
  ref_truck:     "/send-tiles/vehicles/ref_truck.png",
};

/**
 * Map a vehicle code to its brand image. Falls back to the truck silhouette
 * for any future unlisted variant so a missing image never breaks the card.
 */
export const vehicleImage = (code) => VEHICLE_IMAGES[code] || VEHICLE_IMAGES.truck;
