import { GOOGLE_MAPS_KEY, WEB_ORIGIN } from './config';
import { Platform } from 'react-native';

export type PickedAddress = {
  label: string;
  line1: string;
  city: string;
  country: string;
  formatted_address: string;
  latitude: number;
  longitude: number;
  place_id?: string;
  id?: string;
};

export type Prediction = { placeId: string; main: string; secondary: string };

// The shared Maps key is HTTP-referrer restricted to baked.ci; native requests declare it explicitly.
const headers = (fieldMask?: string): Record<string, string> => ({
  'Content-Type': 'application/json',
  'X-Goog-Api-Key': GOOGLE_MAPS_KEY,
  ...(fieldMask ? { 'X-Goog-FieldMask': fieldMask } : {}),
  ...(Platform.OS !== 'web' ? { Referer: `${WEB_ORIGIN}/` } : {}),
});

const BASE = 'https://places.googleapis.com/v1';

export async function autocomplete(input: string, country: string, lang: string, sessionToken: string): Promise<Prediction[]> {
  const res = await fetch(`${BASE}/places:autocomplete`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ input, includedRegionCodes: [country.toLowerCase()], languageCode: lang, sessionToken }),
  });
  const data = await res.json();
  return (data.suggestions || [])
    .map((s: any) => s.placePrediction)
    .filter(Boolean)
    .map((p: any) => ({
      placeId: p.placeId,
      main: p.structuredFormat?.mainText?.text || p.text?.text,
      secondary: p.structuredFormat?.secondaryText?.text || '',
    }));
}

const toAddress = (p: any, country: string, fallbackLabel: string): PickedAddress => {
  const comps: any[] = p.addressComponents || [];
  const find = (type: string) => comps.find((c) => c.types?.includes(type))?.longText;
  const city = find('locality') || find('administrative_area_level_2') || find('administrative_area_level_1') || '';
  const iso = comps.find((c) => c.types?.includes('country'))?.shortText;
  return {
    label: p.displayName?.text || fallbackLabel,
    line1: p.displayName?.text || p.formattedAddress || fallbackLabel,
    city,
    country: iso || country,
    formatted_address: p.formattedAddress || '',
    latitude: p.location?.latitude,
    longitude: p.location?.longitude,
    place_id: p.id,
  };
};

const FIELDS = 'id,displayName,formattedAddress,location,addressComponents';

export async function placeDetails(placeId: string, country: string, lang: string, sessionToken: string) {
  const res = await fetch(`${BASE}/places/${placeId}?languageCode=${lang}&sessionToken=${sessionToken}`, {
    headers: headers(FIELDS),
  });
  return toAddress(await res.json(), country, '');
}

export async function nearestAddress(lat: number, lng: number, country: string, lang: string, label: string) {
  const res = await fetch(`${BASE}/places:searchNearby`, {
    method: 'POST',
    headers: headers(FIELDS.split(',').map((f) => `places.${f}`).join(',')),
    body: JSON.stringify({
      maxResultCount: 1,
      rankPreference: 'DISTANCE',
      languageCode: lang,
      locationRestriction: { circle: { center: { latitude: lat, longitude: lng }, radius: 150 } },
    }),
  });
  const data = await res.json();
  const place = data.places?.[0];
  const addr = place ? toAddress(place, country, label) : null;
  return {
    label,
    line1: addr?.formatted_address?.split(',')[0] || label,
    city: addr?.city || '',
    country: addr?.country || country,
    formatted_address: addr?.formatted_address || `${lat.toFixed(5)}, ${lng.toFixed(5)}`,
    latitude: lat,
    longitude: lng,
  } as PickedAddress;
}

export const newSessionToken = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`;
