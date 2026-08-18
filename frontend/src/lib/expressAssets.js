/**
 * SENDbakēd — official brand asset URLs.
 * These are the production-approved renders. Do NOT swap for generated icons.
 * (P0 correction pass: renamed brand from EXPRESSbakēd to SENDbakēd; internal
 *  module identifier `express` is intentionally preserved.)
 */
export const EXPRESS_ASSETS = {
  wordmark: "https://customer-assets-4nw71qhi.emergentagent.net/job_baked-platform/artifacts/9avasnni_EXPRESSbaked.png",
  bike:     "https://customer-assets-4nw71qhi.emergentagent.net/job_baked-platform/artifacts/kkvj338q_Bike_baked.png",
  threeW:   "https://customer-assets-4nw71qhi.emergentagent.net/job_baked-platform/artifacts/xarw2ocr_3W-baked.png",
  truck:    "https://customer-assets-4nw71qhi.emergentagent.net/job_baked-platform/artifacts/ftc2sme4_Truck_baked.png",
  parcel:   "https://customer-assets-4nw71qhi.emergentagent.net/job_baked-platform/artifacts/zh3bpr0c_Parcel.png",
  moving:   "https://customer-assets-4nw71qhi.emergentagent.net/job_baked-platform/artifacts/2xdp5al4_Home_Shifting.png",
};

/**
 * Map a vehicle code to its brand image. Fallback to truck for larger types
 * (mini_truck, truck) until dedicated renders are supplied.
 */
export const vehicleImage = (code) => {
  if (code === "bike" || code === "scooter") return EXPRESS_ASSETS.bike;
  if (code === "three_wheeler") return EXPRESS_ASSETS.threeW;
  return EXPRESS_ASSETS.truck;
};
