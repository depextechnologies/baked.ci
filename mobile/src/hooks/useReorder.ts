import { router } from 'expo-router';
import { useCallback } from 'react';

import { api } from '@/lib/api';
import { useCart } from '@/state/CartContext';

// Rebuilds the shared cart from a past MART or FOOD order; the backend reprices everything at checkout.
export function useReorder() {
  const { setMartQty, addFood } = useCart();
  return useCallback(async (module: 'mart' | 'food', order: any) => {
    if (module === 'mart') {
      for (const it of order.items || []) {
        await setMartQty({ id: it.product_id, name: it.name, price: Number(it.price), image: it.image, unit: it.unit, currency: it.currency || order.currency }, it.quantity).catch(() => {});
      }
    } else {
      // Order snapshots carry no images — take them from the live menu.
      const menu = await api<any>(`/food/restaurants/${order.restaurant_id}/menu`).catch(() => null);
      const images: Record<string, string> = {};
      for (const s of menu?.sections || []) for (const m of s.items) images[m.id] = m.image;
      for (const it of order.items || []) {
        const extras = (it.variant?.price_delta || 0) + (it.addons || []).reduce((s: number, a: any) => s + (a.price || 0), 0);
        addFood({
          restaurant_id: order.restaurant_id, restaurant_name: order.restaurant?.name || '', item_id: it.item_id, name: it.name, image: it.image || images[it.item_id],
          base_price: Number(it.unit_price) - extras, currency: order.currency, variant: it.variant || null, addons: it.addons || [],
          notes: it.notes || undefined, quantity: it.quantity,
        });
      }
    }
    router.push('/cart');
  }, [setMartQty, addFood]);
}
