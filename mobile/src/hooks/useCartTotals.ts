import { useEffect, useState } from 'react';

import { api } from '@/lib/api';
import { useApp } from '@/state/AppContext';
import { useCart } from '@/state/CartContext';
import { useSession } from '@/state/SessionContext';

export type FoodGroup = { restaurant_id: string; name: string; subtotal: number; delivery_fee: number; eligible: boolean; unavailable_item_ids: string[] };
export type Totals = {
  currency: string; martSubtotal: number; martFee: number; foodSubtotal: number; foodFee: number;
  total: number; groups: FoodGroup[]; martUnavailable: string[];
};

// All money comes from the backend: FOOD from /cart/quote (repriced incl. options), MART from the
// same eligibility engine that POST /orders uses (quote for guests, who have no account cart yet).
export function useCartTotals() {
  const { mart, food, foodMode, version } = useCart();
  const { address, country } = useApp();
  const { isAuthed } = useSession();
  const [totals, setTotals] = useState<Totals | null>(null);
  const [loading, setLoading] = useState(false);
  const cc = country?.code || 'CI';
  const sig = JSON.stringify([version, mart.map((l) => [l.product_id, l.quantity]), food.map((l) => [l.key, l.quantity]), foodMode, address?.latitude, isAuthed]);

  useEffect(() => {
    if (!mart.length && !food.length) { setTotals(null); return; }
    let live = true;
    setLoading(true);
    const items = [
      ...food.map((l) => ({ module: 'food', restaurant_id: l.restaurant_id, menu_item_id: l.item_id, quantity: l.quantity, variant_id: l.variant?.id, addon_ids: l.addons.map((a) => a.id) })),
      ...(isAuthed ? [] : mart.map((l) => ({ module: 'mart', product_id: l.product_id, quantity: l.quantity }))),
    ];
    const mode = foodMode === 'dine_in' ? 'pickup' : foodMode;
    const delivery_address = address ? { lat: address.latitude, lng: address.longitude } : undefined;
    Promise.all([
      items.length ? api<any>('/cart/quote', { method: 'POST', body: { items, country: cc, mode, delivery_address }, auth: false }) : null,
      isAuthed && mart.length ? api<any>(`/mart/cart/eligibility?country=${cc}`) : null,
    ]).then(([q, e]) => {
      if (!live) return;
      const martSubtotal = e ? e.subtotal : q?.mart?.subtotal || 0;
      const martFee = e ? e.delivery_fee : q?.mart?.delivery_fee || 0;
      const foodSubtotal = q?.food?.subtotal || 0;
      const foodFee = q?.food?.delivery_fee || 0;
      setTotals({
        currency: q?.currency || e?.currency || 'XOF', martSubtotal, martFee, foodSubtotal, foodFee,
        total: martSubtotal + martFee + foodSubtotal + foodFee,
        groups: q?.food?.groups || [], martUnavailable: q?.mart?.unavailable_item_ids || [],
      });
    }).catch(() => live && setTotals(null)).finally(() => live && setLoading(false));
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig, cc]);

  return { totals, loading };
}
