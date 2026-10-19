import { Apple, BookOpen, Car, Dumbbell, Footprints, Gamepad2, Gem, Hammer, Laptop, Luggage, Refrigerator, Scissors, Shirt, Smartphone, Sofa, Sparkles, Tv, UserRound, Baby, type LucideIcon } from 'lucide-react-native';

import { WEB_ORIGIN } from '@/lib/config';
import type { Lang, TKey } from '@/lib/i18n';
import type { ModuleCode } from '@/lib/modules';

export type Tile = { id: string; name: string; image?: string | number | null; icon?: LucideIcon };

export const SHOP_ICONS: Record<string, LucideIcon> = {
  'mode-femme': Shirt, 'mode-homme': UserRound, 'bebe-enfant': Baby, 'chaussures-sneakers': Footprints, 'sacs-bagages': Luggage,
  'bijoux-montres-lunettes': Gem, 'sports-loisirs': Dumbbell, 'textile-mercerie': Scissors, 'librairie-papeterie': BookOpen,
  'jeux-video-consoles': Gamepad2, apple: Apple, 'smartphones-telephones': Smartphone, 'tv-son-photo': Tv, electromenager: Refrigerator,
  'informatique-bureau': Laptop, 'meuble-decoration': Sofa, 'bricolage-jardin': Hammer, 'beaute-bien-etre': Sparkles, automobile: Car,
};

const SEND_TILES: Record<string, string | null> = {
  moto: null,
  cargo: 'send_by_cargo.png',
  fresh_products: 'fresh_products.png',
  between_cities: 'between_cities.png',
  multiple_shipments: 'multiple_shipments.png',
  packers_movers: 'packers_movers.png',
};

const pick = (o: any, lang: Lang) => (lang === 'en' ? o.name_en || o.name : o.name_fr || o.name);

// Module-specific category source — each module only ever loads its own catalogue.
export const categoryEndpoint = (code: ModuleCode, country: string) => ({
  mart: `/mart/categories?country=${country}`,
  food: `/food/categories?country=${country}`,
  shop: `/shop/categories?country=${country}`,
  express: `/express/services?country=${country}`,
} as Record<string, string>)[code];

export function toTiles(code: ModuleCode, data: any, lang: Lang, t: (k: TKey) => string, fallbackImg: number): Tile[] {
  if (!data) return [];
  if (code === 'express') {
    return [...(data.service_types || []), 'packers_movers'].map((s: string) => ({
      id: s,
      name: t(`send.${s}` as TKey),
      image: SEND_TILES[s] ? `${WEB_ORIGIN}/send-tiles/${SEND_TILES[s]}` : fallbackImg,
    }));
  }
  const list: any[] = Array.isArray(data) ? data : data.items || [];
  return list
    .filter((c) => c.code !== 'all')
    .map((c) => ({ id: c.code || c.slug || c.id, name: pick(c, lang), image: c.image, icon: code === 'shop' ? SHOP_ICONS[c.slug] : undefined }));
}
