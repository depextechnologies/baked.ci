import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { api } from '@/lib/api';
import { prefs } from '@/lib/storage';
import { useSession } from './SessionContext';

export type MartProduct = {
  id: string; name: string; price: number; was_price?: number | null; image?: string; unit?: string;
  currency: string; currency_symbol?: string; in_stock?: boolean; badge?: string | null;
};
export type MartLine = { id?: string; product_id: string; quantity: number; product: MartProduct };
export type ShopVariant = { id: string; price: number; currency: string; title_suffix?: string; image?: string; product_id: string; product_title: string };
export type ShopLine = { id?: string; variant_id: string; quantity: number; variant: ShopVariant };
export type FoodOption = { id: string; name: string; price_delta?: number; price?: number };
export type FoodLine = {
  key: string; restaurant_id: string; restaurant_name: string; item_id: string; name: string; image?: string;
  base_price: number; currency: string; variant?: FoodOption | null; addons: FoodOption[]; notes?: string; quantity: number;
};
export type FoodMode = 'delivery' | 'pickup' | 'dine_in';

export const foodUnitPrice = (l: FoodLine) =>
  l.base_price + (l.variant?.price_delta || 0) + l.addons.reduce((s, a) => s + (a.price || 0), 0);

type CartState = {
  mart: MartLine[]; food: FoodLine[]; shop: ShopLine[]; count: number; ready: boolean; version: number;
  setShopQty: (v: ShopVariant, qty: number) => Promise<void>;
  foodMode: FoodMode; setFoodMode: (m: FoodMode) => void;
  martQty: (productId: string) => number;
  setMartQty: (product: MartProduct, qty: number) => Promise<void>;
  addFood: (line: Omit<FoodLine, 'key'>) => void;
  setFoodQty: (key: string, qty: number) => void;
  clearFood: (restaurantId?: string) => void;
  reload: () => Promise<void>;
};

const Ctx = createContext<CartState | null>(null);
const lineKey = (l: Omit<FoodLine, 'key'>) =>
  [l.item_id, l.variant?.id || '', ...l.addons.map((a) => a.id).sort(), l.notes || ''].join('|');

export function CartProvider({ children }: { children: React.ReactNode }) {
  const { isAuthed } = useSession();
  const [mart, setMart] = useState<MartLine[]>([]);
  const [food, setFood] = useState<FoodLine[]>([]);
  const [shop, setShop] = useState<ShopLine[]>([]);
  const [foodMode, _setFoodMode] = useState<FoodMode>('delivery');
  const [ready, setReady] = useState(false);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    prefs.get<FoodLine[]>('food_cart', []).then(setFood);
    prefs.get<FoodMode>('food_mode', 'delivery').then(_setFoodMode);
  }, []);

  const persistFood = (next: FoodLine[]) => { setFood(next); prefs.set('food_cart', next); };

  // MART lives on the account cart once signed in; guests keep it on the device and merge at login.
  const reload = useCallback(async () => {
    if (!isAuthed) {
      setMart(await prefs.get<MartLine[]>('guest_mart_cart', []));
      setShop(await prefs.get<ShopLine[]>('guest_shop_cart', []));
      setReady(true); setVersion((v) => v + 1); return;
    }
    const guestShop = await prefs.get<ShopLine[]>('guest_shop_cart', []);
    if (guestShop.length) {
      for (const g of guestShop) await api('/shop/cart/items', { method: 'POST', body: { variant_id: g.variant_id, quantity: g.quantity } }).catch(() => {});
      await prefs.remove('guest_shop_cart');
    }
    api<{ items: any[] }>('/shop/cart/me').then((c) => setShop((c.items || []).map((i) => ({
      id: i.id, variant_id: i.variant.id, quantity: i.quantity,
      variant: { id: i.variant.id, price: i.variant.price, currency: i.variant.currency, title_suffix: i.variant.title_suffix,
        image: i.variant.images?.[0] || i.product.images?.[0], product_id: i.product.id, product_title: i.product.title_fr || i.product.title },
    })))).catch(() => {}).finally(() => setVersion((v) => v + 1));
    const guest = await prefs.get<MartLine[]>('guest_mart_cart', []);
    if (guest.length) {
      for (const g of guest) await api('/carts/me/items', { method: 'POST', body: { product_id: g.product_id, quantity: g.quantity, module: 'mart' } }).catch(() => {});
      await prefs.remove('guest_mart_cart');
    }
    try {
      const c = await api<{ items: any[] }>('/carts/me');
      setMart((c.items || []).filter((i) => i.module !== 'shop').map((i) => ({ id: i.id, product_id: i.product_id, quantity: i.quantity, product: i.product })));
    } catch { /* keep last known */ }
    setReady(true);
    setVersion((v) => v + 1);
  }, [isAuthed]);

  useEffect(() => { reload(); }, [reload]);

  const martQty = useCallback((pid: string) => mart.find((l) => l.product_id === pid)?.quantity || 0, [mart]);

  const setMartQty = useCallback(async (product: MartProduct, qty: number) => {
    const existing = mart.find((l) => l.product_id === product.id);
    const nextLocal = qty <= 0 ? mart.filter((l) => l.product_id !== product.id)
      : existing ? mart.map((l) => (l.product_id === product.id ? { ...l, quantity: qty } : l))
        : [...mart, { product_id: product.id, quantity: qty, product }];
    setMart(nextLocal);
    if (!isAuthed) { await prefs.set('guest_mart_cart', nextLocal); setVersion((v) => v + 1); return; }
    try {
      if (existing?.id && qty <= 0) await api(`/carts/me/items/${existing.id}`, { method: 'DELETE' });
      else if (existing?.id) await api(`/carts/me/items/${existing.id}`, { method: 'PATCH', body: { quantity: qty } });
      else await api('/carts/me/items', { method: 'POST', body: { product_id: product.id, quantity: qty, module: 'mart' } });
    } finally { await reload(); }
  }, [mart, isAuthed, reload]);

  const setShopQty = useCallback(async (v: ShopVariant, qty: number) => {
    const existing = shop.find((l) => l.variant_id === v.id);
    const next = qty <= 0 ? shop.filter((l) => l.variant_id !== v.id)
      : existing ? shop.map((l) => (l.variant_id === v.id ? { ...l, quantity: qty } : l)) : [...shop, { variant_id: v.id, quantity: qty, variant: v }];
    setShop(next);
    if (!isAuthed) { await prefs.set('guest_shop_cart', next); setVersion((x) => x + 1); return; }
    try {
      if (existing?.id && qty <= 0) await api(`/shop/cart/items/${existing.id}`, { method: 'DELETE' });
      else if (existing?.id) await api(`/shop/cart/items/${existing.id}`, { method: 'PATCH', body: { quantity: qty } });
      else await api('/shop/cart/items', { method: 'POST', body: { variant_id: v.id, quantity: qty } });
    } finally { await reload(); }
  }, [shop, isAuthed, reload]);

  const addFood = useCallback((line: Omit<FoodLine, 'key'>) => {
    const key = lineKey(line);
    const hit = food.find((l) => l.key === key);
    persistFood(hit ? food.map((l) => (l.key === key ? { ...l, quantity: Math.min(50, l.quantity + line.quantity) } : l)) : [...food, { ...line, key }]);
  }, [food]);

  const setFoodQty = useCallback((key: string, qty: number) => {
    persistFood(qty <= 0 ? food.filter((l) => l.key !== key) : food.map((l) => (l.key === key ? { ...l, quantity: Math.min(50, qty) } : l)));
  }, [food]);

  const clearFood = useCallback((rid?: string) => persistFood(rid ? food.filter((l) => l.restaurant_id !== rid) : []), [food]);
  const setFoodMode = useCallback((m: FoodMode) => { _setFoodMode(m); prefs.set('food_mode', m); }, []);

  const count = mart.reduce((s, l) => s + l.quantity, 0) + food.reduce((s, l) => s + l.quantity, 0) + shop.reduce((s, l) => s + l.quantity, 0);
  const value = useMemo(() => ({
    mart, food, shop, setShopQty, count, ready, version, foodMode, setFoodMode, martQty, setMartQty, addFood, setFoodQty, clearFood, reload,
  }), [mart, food, shop, setShopQty, count, ready, version, foodMode, setFoodMode, martQty, setMartQty, addFood, setFoodQty, clearFood, reload]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useCart = () => {
  const v = useContext(Ctx);
  if (!v) throw new Error('useCart outside CartProvider');
  return v;
};
