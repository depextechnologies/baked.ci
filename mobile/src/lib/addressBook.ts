import { useSyncExternalStore } from 'react';

import { api } from './api';
import type { PickedAddress } from './places';

export type SavedAddress = {
  id: string; label: string | null; line1: string; line2?: string | null; city?: string | null; country: string;
  landmark?: string | null; instructions?: string | null; latitude?: number | null; longitude?: number | null;
  is_default: boolean; place_id?: string | null; formatted_address?: string | null; region?: string | null;
  postal_code?: string | null; recipient_name?: string | null; recipient_phone?: string | null;
};

export type AddressInput = Omit<SavedAddress, 'id' | 'is_default'> & { is_default?: boolean };

export const listAddresses = () => api<SavedAddress[]>('/customers/me/addresses');
export const createAddress = (a: AddressInput) => api<SavedAddress>('/customers/me/addresses', { method: 'POST', body: a });
export const updateAddress = (id: string, a: AddressInput) => api<SavedAddress>(`/customers/me/addresses/${id}`, { method: 'PATCH', body: a });
export const deleteAddress = (id: string) => api(`/customers/me/addresses/${id}`, { method: 'DELETE' });

export const toPicked = (a: SavedAddress): PickedAddress => ({
  id: a.id, label: a.label || '', line1: a.line1, city: a.city || '', country: a.country,
  formatted_address: a.formatted_address || [a.line1, a.city].filter(Boolean).join(', '),
  latitude: a.latitude == null ? (null as any) : Number(a.latitude), longitude: a.longitude == null ? (null as any) : Number(a.longitude), place_id: a.place_id || undefined,
});

// Location picked on the map/search screen while editing an address (handed back to the form).
let pendingPick: PickedAddress | null = null;
export const setPendingPick = (p: PickedAddress) => { pendingPick = p; };
export const takePendingPick = () => { const p = pendingPick; pendingPick = null; return p; };

// Address chosen for the current checkout only (never changes the default).
let checkoutId: string | null = null;
const subs = new Set<() => void>();
export const setCheckoutAddressId = (id: string | null) => { checkoutId = id; subs.forEach((f) => f()); };
export const useCheckoutAddressId = () => useSyncExternalStore(
  (f) => { subs.add(f); return () => { subs.delete(f); }; }, () => checkoutId, () => checkoutId);
