/**
 * EXPRESSbakēd — official brand asset URLs.
 * These are the production-approved renders. Do NOT swap for generated icons.
 */
export const EXPRESS_ASSETS = {
  wordmark: "https://customer-assets-4nw71qhi.emergentagent.net/job_baked-platform/artifacts/9avasnni_EXPRESSbaked.png",
  bike:     "https://customer-assets-4nw71qhi.emergentagent.net/job_baked-platform/artifacts/coe69eua_EXPRESSBike.png",
  threeW:   "https://customer-assets-4nw71qhi.emergentagent.net/job_baked-platform/artifacts/c7niryj4_EXPRESS3W.png",
  truck:    "https://customer-assets-4nw71qhi.emergentagent.net/job_baked-platform/artifacts/sqokzl5j_EXPRESSTruck.png",
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
