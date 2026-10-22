import { API_URL } from './config';
import type { Lang } from './i18n';

// Shared homepage contract — same payload the website renders (GET /api/homepage).
export type CmsSection = {
  id: string; country: string; module: string; section_type: string;
  title?: string | null; subtitle?: string | null; config: Record<string, any>; display_order: number; is_enabled: boolean;
};
export type CmsHomepage = { country: string; module: string; version: string; updated_at: string | null; sections: CmsSection[] };

// `key_fr` overrides `key` in French, exactly like the website's pickBilingual.
export const pick = (o: any, key: string, lang: Lang): string | undefined => {
  if (!o) return undefined;
  const fr = o[`${key}_fr`];
  return lang === 'fr' && fr ? fr : o[key] ?? undefined;
};
export const sectionText = (s: CmsSection, key: 'title' | 'subtitle', lang: Lang) => (lang === 'fr' && s.config?.[`${key}_fr`]) || s[key] || undefined;

const ORIGIN = API_URL.replace(/\/api$/, '');
export const absUrl = (u?: string | null) => (u && u.startsWith('/') ? `${ORIGIN}${u}` : u || null);

// Responsive asset: phone < 768 ≤ tablet < 1024 ≤ desktop, falling back to the base image.
export const assetFor = (o: any, width: number, key = 'image') =>
  absUrl((width < 768 && o?.[`${key}_mobile`]) || (width < 1024 && o?.[`${key}_tablet`]) || o?.[key]);

// Website CMS links -> native routes.
export function nativeLink(link: string | null | undefined, module: string): string {
  const l = (link || '').split('#')[0].replace(/^\/shopbaked/, '/shop').replace(/^\/martbaked/, '/mart');
  let m: RegExpMatchArray | null;
  if ((m = l.match(/^\/shop\/c\/([^/?]+)/))) return `/shop/category/${m[1]}`;
  if ((m = l.match(/^\/shop\/p\/([^/?]+)/))) return `/shop/product/${m[1]}`;
  if (/^\/shop(\/categories)?\/?$/.test(l) || l === '') return module === 'shop' ? '/shop/category/all' : module === 'mart' ? '/mart/category/all' : `/${module}`;
  if ((m = l.match(/^\/mart\/c(?:ategory)?\/([^/?]+)/))) return `/mart/category/${m[1]}`;
  if (module === 'mart' && /^\/(products|produits|categories)/.test(l)) {
    const cat = (link || '').match(/[?&]category=([^&#]+)/);
    return `/mart/category/${cat ? cat[1] : 'all'}`;
  }
  if ((m = l.match(/^\/mart\/p(?:roduct)?\/([^/?]+)/))) return `/mart/product/${m[1]}`;
  if ((m = l.match(/^\/food\/r(?:estaurant)?\/([^/?]+)/))) return `/food/restaurant/${m[1]}`;
  return l;
}
