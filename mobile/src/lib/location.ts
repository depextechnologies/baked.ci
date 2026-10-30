import * as Location from 'expo-location';
import { Platform } from 'react-native';

import { api } from './api';
import { nearestAddress, type PickedAddress } from './places';

export type DetectResult = { status: 'ok'; address: PickedAddress } | { status: 'denied' | 'unavailable' };

async function reverse(lat: number, lng: number, fallbackCountry: string, lang: string, label: string): Promise<PickedAddress> {
  if (Platform.OS !== 'web') {
    try {
      const [r] = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
      if (r) {
        const line1 = [r.streetNumber, r.street].filter(Boolean).join(' ') || r.name || r.district || label;
        return {
          label, line1, city: r.city || r.subregion || r.region || '', country: r.isoCountryCode || fallbackCountry,
          formatted_address: r.formattedAddress || [line1, r.city, r.country].filter(Boolean).join(', '),
          latitude: lat, longitude: lng,
        };
      }
    } catch { /* fall back to Places lookup */ }
  }
  return nearestAddress(lat, lng, fallbackCountry, lang, label);
}

export async function detectCurrentAddress(country: string, lang: string, label: string): Promise<DetectResult> {
  const perm = await Location.requestForegroundPermissionsAsync();
  if (perm.status !== 'granted') return { status: 'denied' };
  try {
    const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
    return { status: 'ok', address: await reverse(pos.coords.latitude, pos.coords.longitude, country, lang, label) };
  } catch {
    return { status: 'unavailable' };
  }
}

export { reverse as reverseGeocode };

export async function checkServiceable(a: PickedAddress): Promise<boolean> {
  try {
    const r = await api<{ serviceable: boolean }>(
      `/addresses/serviceability?lat=${a.latitude}&lng=${a.longitude}&country=${a.country}`, { auth: false },
    );
    return !!r.serviceable;
  } catch {
    return true;
  }
}
