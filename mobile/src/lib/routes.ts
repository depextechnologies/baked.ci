import { Platform } from 'react-native';

import { GOOGLE_MAPS_KEY, WEB_ORIGIN } from './config';

export type LatLng = { latitude: number; longitude: number };
export type Route = { coords: LatLng[]; distanceKm: number | null; durationMin: number | null; road: boolean };

function decode(enc: string): LatLng[] {
  const out: LatLng[] = []; let i = 0, lat = 0, lng = 0;
  while (i < enc.length) {
    for (const k of [0, 1]) {
      let b, shift = 0, res = 0;
      do { b = enc.charCodeAt(i++) - 63; res |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
      const d = res & 1 ? ~(res >> 1) : res >> 1;
      if (k === 0) lat += d; else lng += d;
    }
    out.push({ latitude: lat / 1e5, longitude: lng / 1e5 });
  }
  return out;
}

const wp = (p: LatLng) => ({ location: { latLng: { latitude: p.latitude, longitude: p.longitude } } });

// Road route via Google Routes API; falls back to straight segments if the API is unavailable for this key.
export async function computeRoute(points: LatLng[]): Promise<Route> {
  const straight: Route = { coords: points, distanceKm: null, durationMin: null, road: false };
  if (points.length < 2) return straight;
  try {
    const res = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json', 'X-Goog-Api-Key': GOOGLE_MAPS_KEY,
        'X-Goog-FieldMask': 'routes.distanceMeters,routes.duration,routes.polyline.encodedPolyline',
        ...(Platform.OS !== 'web' ? { Referer: `${WEB_ORIGIN}/` } : {}),
      },
      body: JSON.stringify({
        origin: wp(points[0]), destination: wp(points[points.length - 1]),
        intermediates: points.slice(1, -1).map(wp), travelMode: 'DRIVE',
      }),
    });
    const r = (await res.json()).routes?.[0];
    if (!r?.polyline?.encodedPolyline) return straight;
    return { coords: decode(r.polyline.encodedPolyline), distanceKm: r.distanceMeters / 1000, durationMin: Math.round(parseInt(r.duration, 10) / 60), road: true };
  } catch {
    return straight;
  }
}
