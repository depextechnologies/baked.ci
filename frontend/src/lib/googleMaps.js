/**
 * shared/googleMaps.js — thin wrappers around the Google Maps JavaScript API
 * using the **Places API (New)** exclusively.
 *
 * References (Feb 2026):
 * - google.maps.places.AutocompleteSuggestion.fetchAutocompleteSuggestions
 * - google.maps.places.Place / Place.fetchFields
 * - google.maps.Geocoder.geocode
 */

/**
 * Google Places Autocomplete predictions (New API), restricted to the active country.
 * Returns an array of normalized suggestions: { placeId, mainText, secondaryText, description, _suggestion }
 * The raw suggestion is preserved so consumers can call `.placePrediction.toPlace()`.
 */
export const fetchAutocompleteSuggestions = async ({ input, countryCode, sessionToken }) => {
  const g = window.google;
  if (!g?.maps?.places?.AutocompleteSuggestion || !input?.trim()) return [];
  try {
    const request = {
      input,
      sessionToken,
      includedRegionCodes: countryCode ? [countryCode.toLowerCase()] : undefined,
    };
    const { suggestions } = await g.maps.places.AutocompleteSuggestion.fetchAutocompleteSuggestions(request);
    return (suggestions || []).map((s) => {
      const pp = s.placePrediction;
      if (!pp) return null;
      return {
        placeId: pp.placeId,
        mainText: pp.structuredFormat?.mainText?.text || pp.text?.text || "",
        secondaryText: pp.structuredFormat?.secondaryText?.text || "",
        description: pp.text?.text || "",
        _suggestion: s,
      };
    }).filter(Boolean);
  } catch (e) {
    console.error("Places autocomplete failed", e);
    return [];
  }
};

/**
 * Fetch full place details for a suggestion returned by fetchAutocompleteSuggestions.
 * Uses the modern Place.fetchFields pattern; returns a normalized address object.
 */
export const fetchPlaceDetails = async ({ suggestion }) => {
  if (!suggestion?._suggestion?.placePrediction) throw new Error("Invalid suggestion");
  const place = suggestion._suggestion.placePrediction.toPlace();
  await place.fetchFields({
    fields: ["id", "formattedAddress", "location", "addressComponents", "displayName"],
  });
  return normalizePlace(place);
};

/**
 * Reverse-geocode a coordinate to a formatted address (used by Detect My Location).
 * Uses the classic Geocoder — this endpoint is fully supported under the modern Geocoding API.
 */
export const reverseGeocode = async ({ lat, lng }) => {
  const g = window.google;
  if (!g?.maps?.Geocoder) throw new Error("Geocoder not ready");
  const geocoder = new g.maps.Geocoder();
  const result = await new Promise((resolve, reject) => {
    geocoder.geocode({ location: { lat, lng } }, (results, status) => {
      if (status !== "OK" || !results?.length) return reject(new Error(status || "no results"));
      resolve(results[0]);
    });
  });
  return normalizePlace(result);
};

/**
 * Normalize either a Place (New API) or a GeocoderResult into the shape we persist.
 * Handles both:
 *   - Place (new): { id, formattedAddress, location:{lat(),lng()}, addressComponents:[{types,longText}] }
 *   - GeocoderResult (classic): { place_id, formatted_address, geometry.location.lat(), address_components:[{types,long_name}] }
 */
export const normalizePlace = (raw) => {
  if (!raw) return {};
  // Detect shape
  const isNew = "formattedAddress" in raw || "addressComponents" in raw;
  const comps = (isNew ? raw.addressComponents : raw.address_components) || [];
  const findComp = (type) => {
    const c = comps.find((c) => (c.types || []).includes(type));
    if (!c) return null;
    return isNew ? (c.longText || c.shortText) : c.long_name;
  };
  const findShort = (type) => {
    const c = comps.find((c) => (c.types || []).includes(type));
    if (!c) return null;
    return isNew ? (c.shortText || c.longText) : c.short_name;
  };
  const loc = isNew ? raw.location : raw.geometry?.location;
  const lat = typeof loc?.lat === "function" ? loc.lat() : loc?.lat ?? null;
  const lng = typeof loc?.lng === "function" ? loc.lng() : loc?.lng ?? null;
  return {
    place_id: isNew ? raw.id : raw.place_id,
    formatted_address: isNew ? raw.formattedAddress : raw.formatted_address,
    latitude: lat,
    longitude: lng,
    city: findComp("locality") || findComp("administrative_area_level_2") || null,
    region: findComp("administrative_area_level_1") || null,
    country: (findShort("country") || "").toUpperCase() || null,
    postal_code: findComp("postal_code") || null,
  };
};
