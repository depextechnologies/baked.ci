import { Image } from 'expo-image';
import { router } from 'expo-router';
import { ChevronRight } from 'lucide-react-native';
import React from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';

import { useFetch } from '@/hooks/useFetch';
import { SHOP_ICONS } from '../module/moduleData';
import { ShoppingBag, UtensilsCrossed } from 'lucide-react-native';
import { useHomepage } from '@/hooks/useHomepage';
import { absUrl } from '@/lib/cms';
import { WEB_ORIGIN } from '@/lib/config';
import { MODULES, type ModuleCode } from '@/lib/modules';
import { useApp } from '@/state/AppContext';
import { useCart } from '@/state/CartContext';
import { colors, hexA } from '@/theme';
import { AppText } from '../ui/AppText';
import { Touchable } from '../ui/Button';
import { ErrorView, Skeleton } from '../ui/StateView';

type Item = { id: string; name: string; image?: string | null; to: string; subs?: Item[] };
const fallbackIcon = (code: ModuleCode, id: string) => (code === 'shop' ? SHOP_ICONS[id] || ShoppingBag : code === 'food' ? UtensilsCrossed : ShoppingBag);
const SEND_ROUTE: Record<string, string> = { moto: '/send/book?service=moto', cargo: '/send/book?service=cargo', fresh: '/send/book?service=fresh_products', between_cities: '/send/book?service=between_cities', multi: '/send/book?service=multiple_shipments', movers: '/send/movers' };
const nm = (o: any, lang: string) => (lang === 'fr' ? o.name_fr || o.name || o.name_en : o.name_en || o.name || o.name_fr) || o.slug || o.code;
const img = (u?: string | null) => (u?.startsWith('/send-tiles') ? `${WEB_ORIGIN}${u}` : absUrl(u));

// Explorer = discovery inside the active module, from that module's own (admin-managed) taxonomy.
function useModuleItems(code: ModuleCode): { items: Item[] | null; loading: boolean; error: boolean; reload: () => void; extra?: { title: string; items: Item[] } } {
  const { lang, country, address } = useApp();
  const { foodMode } = useCart();
  const cc = country?.code || 'CI';
  const send = useHomepage(code === 'express' ? 'express' : null, cc);
  const mart = useFetch<any>(code === 'mart' ? `/mart/categories?country=${cc}` : null, [cc, code]);
  const shop = useFetch<any[]>(code === 'shop' ? `/shop/catalogue?country=${cc}` : null, [cc, code]);
  const fq = `/food/home?country=${cc}&mode=${foodMode}${address ? `&lat=${address.latitude}&lng=${address.longitude}` : ''}`;
  const food = useFetch<any>(code === 'food' ? fq : null, [fq, code]);
  if (code === 'express') {
    const tiles = send.data?.sections.find((s) => s.section_type === 'send_service_tiles')?.config?.tiles || [];
    return { loading: send.loading, error: !send.data && !send.loading, reload: send.refresh,
      items: send.data ? tiles.filter((x: any) => x.enabled !== false).map((x: any) => ({ id: x.key, name: lang === 'fr' ? x.title_fr || x.title_en : x.title_en || x.title_fr, image: img(x.image), to: SEND_ROUTE[x.key] || '/send/book' })) : null };
  }
  if (code === 'mart') {
    const rows = Array.isArray(mart.data) ? mart.data : mart.data?.items;
    return { loading: mart.loading, error: !!mart.error, reload: mart.reload, items: rows ? rows.map((c: any) => ({ id: c.slug, name: nm(c, lang), image: c.image, to: `/mart/category/${c.slug}` })) : null };
  }
  if (code === 'shop') {
    return { loading: shop.loading, error: !!shop.error, reload: shop.reload, items: shop.data ? shop.data.map((c) => ({ id: c.slug, name: nm(c, lang), image: c.image, to: `/shop/category/${c.slug}`,
      subs: (c.subcategories || []).map((s: any) => ({ id: s.slug, name: nm(s, lang), to: `/shop/category/${c.slug}?sub=${s.slug}` })) })) : null };
  }
  const d = food.data;
  return { loading: food.loading, error: !!food.error, reload: food.reload,
    items: d ? (d.categories || []).filter((c: any) => c.code !== 'all').map((c: any) => ({ id: c.code, name: nm(c, lang), image: c.image, to: `/food/discover?category=${c.code}` })) : null,
    extra: d ? { title: lang === 'fr' ? 'Cuisines' : 'Cuisines', items: (d.cuisines || []).map((c: any) => ({ id: c.code, name: nm(c, lang), image: c.image, to: `/food/discover?cuisines=${c.code}` })) } : undefined };
}

export function ModuleExplore({ code }: { code: ModuleCode }) {
  const { t } = useApp();
  const { width } = useWindowDimensions();
  const { items, loading, error, reload, extra } = useModuleItems(code);
  const color = MODULES[code].color;
  const n = width >= 768 ? 5 : 3;
  const w = (width - 36 - 10 * (n - 1)) / n;
  const grid = (xs: Item[], prefix: string) => (
    <View style={styles.grid}>
      {xs.map((it) => (
        <View key={it.id} style={{ width: w }}>
          <Touchable testID={`explore-${prefix}-${it.id}`} onPress={() => router.push(it.to as any)} style={styles.tile} scale={0.97}>
            <View style={[styles.art, { backgroundColor: hexA(color, 0.1) }]}>{it.image ? <Image source={it.image} style={StyleSheet.absoluteFill} contentFit={code === 'express' ? 'contain' : 'cover'} cachePolicy="memory-disk" /> : React.createElement(fallbackIcon(code, it.id), { color, size: 28 })}</View>
            <AppText size={12} weight="semibold" align="center" numberOfLines={2} style={{ padding: 8, lineHeight: 15 }}>{it.name}</AppText>
          </Touchable>
          {it.subs?.length ? it.subs.slice(0, 4).map((s) => (
            <Touchable key={s.id} testID={`explore-sub-${it.id}-${s.id}`} onPress={() => router.push(s.to as any)} style={styles.sub}>
              <AppText size={11} color={colors.textMuted} numberOfLines={2} style={{ flex: 1, lineHeight: 14 }}>{s.name}</AppText><ChevronRight color={colors.textDim} size={12} />
            </Touchable>
          )) : null}
        </View>
      ))}
    </View>
  );
  return (
    <View testID={`explore-module-${code}`} style={{ paddingHorizontal: 18, paddingTop: 8 }}>
      <AppText weight="semibold" size={12} color={colors.textMuted} style={styles.caption}>{t(code === 'express' ? 'explore.send_services' : 'module.categories').toUpperCase()}</AppText>
      {error ? <ErrorView onRetry={reload} /> : loading && !items ? <Skeleton h={260} /> : items && !items.length ? (
        <AppText size={14} color={colors.textMuted} testID="explore-module-empty">{t('cms.empty')}</AppText>
      ) : grid(items || [], 'item')}
      {extra?.items.length ? (<><AppText weight="semibold" size={12} color={colors.textMuted} style={[styles.caption, { marginTop: 22 }]}>{extra.title.toUpperCase()}</AppText>{grid(extra.items, 'extra')}</>) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  caption: { letterSpacing: 1.2, marginBottom: 12 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tile: { borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  art: { width: '100%', aspectRatio: 1.15, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  sub: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 5, paddingHorizontal: 4 },
});
