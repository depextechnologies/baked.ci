/**
 * shared/googleMaps.js — thin wrappers around the Google Maps JavaScript API.
 * Consumed exclusively by the Address feature. The library is loaded via
 * <APIProvider> inside AddressSelector, so `window.google.maps` is guaranteed
 * to exist inside every callback these helpers are invoked from.
 */

/**
 * Google Places Autocomplete predictions restricted to the active country.
 * Returns a Promise<AutocompletePrediction[]>.
 */
export const getPlacePredictions = ({ input, countryCode, sessionToken, service }) =>
  new Promise((resolve) => {
    if (!service || !input?.trim()) return resolve([]);
    service.getPlacePredictions(
      {
        input,
        sessionToken,
        componentRestrictions: countryCode ? { country: countryCode.toLowerCase() } : undefined,
      },
      (predictions, status) => {
        if (status !== window.google?.maps?.places?.PlacesServiceStatus?.OK || !predictions) return resolve([]);
        resolve(predictions);
      }
    );
  });

/**
 * Fetch place details for a place_id — returns a normalized address object.
 */
export const getPlaceDetails = ({ placeId, sessionToken, service }) =>
  new Promise((resolve, reject) => {
    if (!service || !placeId) return reject(new Error("Missing place service or id"));
    service.getDetails(
      {
        placeId,
        sessionToken,
        fields: ["place_id", "formatted_address", "geometry", "address_components", "name"],
      },
      (place, status) => {
        if (status !== window.google?.maps?.places?.PlacesServiceStatus?.OK || !place) return reject(new Error(status));
        resolve(normalizePlace(place));
      }
    );
  });

/**
 * Reverse-geocode a coordinate to a formatted address (used by Detect Location).
 */
export const reverseGeocode = ({ lat, lng, geocoder }) =>
  new Promise((resolve, reject) => {
    if (!geocoder) return reject(new Error("Geocoder not ready"));
    geocoder.geocode({ location: { lat, lng } }, (results, status) => {
      if (status !== "OK" || !results?.length) return reject(new Error(status));
      resolve(normalizePlace(results[0]));
    });
  });

/**
 * Normalize a Google Place or GeocoderResult into the shape we persist.
 */
export const normalizePlace = (place) => {
  const comps = place.address_components || [];
  const find = (type) => comps.find((c) => c.types?.includes(type))?.long_name;
  return {
    place_id: place.place_id,
    formatted_address: place.formatted_address || place.name || "",
    latitude: place.geometry?.location?.lat?.() ?? place.geometry?.location?.lat ?? null,
    longitude: place.geometry?.location?.lng?.() ?? place.geometry?.location?.lng ?? null,
    city: find("locality") || find("administrative_area_level_2") || null,
    region: find("administrative_area_level_1") || null,
    country: (comps.find((c) => c.types?.includes("country"))?.short_name || "").toUpperCase() || null,
    postal_code: find("postal_code") || null,
  };
};
