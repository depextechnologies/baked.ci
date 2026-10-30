import React, { createContext, useContext } from 'react';

import { useFetch } from '@/hooks/useFetch';
import { useApp } from '@/state/AppContext';
import { useCart } from '@/state/CartContext';

// Same catalogue feed as the website FoodHome (/api/food/home): backend applies the 15 km + mode eligibility rules.
type FoodHome = { categories: any[]; cuisines: any[]; featured_restaurants: any[]; has_customer_coords?: boolean };
const Ctx = createContext<{ data: FoodHome | null; loading: boolean }>({ data: null, loading: true });

export function FoodDataProvider({ children }: { children: React.ReactNode }) {
  const { country, address } = useApp();
  const { foodMode } = useCart();
  const cc = country?.code || 'CI';
  const q = `/food/home?country=${cc}&mode=${foodMode}${address ? `&lat=${address.latitude}&lng=${address.longitude}` : ''}`;
  const { data, loading } = useFetch<FoodHome>(q, [q]);
  return <Ctx.Provider value={{ data, loading }}>{children}</Ctx.Provider>;
}

export const useFoodHome = () => useContext(Ctx);

// Website `bilingual()`: FR default from config.<f>_fr, EN from config.<f>_en, else the stored column.
export const bi = (row: any, f: string, lang: string) => row?.config?.[`${f}_${lang}`] || row?.[f] || '';
// Item-level: <f>_fr / <f>_en, else <f>.
export const biItem = (o: any, f: string, lang: string) => o?.[`${f}_${lang}`] || o?.[`${f}_${lang === 'fr' ? 'en' : 'fr'}`] || o?.[f] || '';
