import { router, useLocalSearchParams } from 'expo-router';
import { SlidersHorizontal } from 'lucide-react-native';
import React, { useCallback, useEffect, useState } from 'react';
import { FlatList, Modal, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CartBar, CartButton } from '@/components/commerce/CartBar';
import { SHOP_ICONS } from '@/components/module/moduleData';
import { ShopCard, type ShopListItem } from '@/components/shop/ShopCard';
import { AppText } from '@/components/ui/AppText';
import { Button, Touchable } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { ErrorView, Skeleton, StateView } from '@/components/ui/StateView';
import { useFetch } from '@/hooks/useFetch';
import { api } from '@/lib/api';
import type { TKey } from '@/lib/i18n';
import { MODULES } from '@/lib/modules';
import { useApp } from '@/state/AppContext';
import { colors, fonts, radius, themed } from '@/theme';

const GOLD = MODULES.shop.color;
const SORTS = ['relevance', 'newest', 'price_asc', 'price_desc', 'discount'] as const;
type Filters = { min?: string; max?: string; brands: string[]; inStock: boolean; discounted: boolean };
const NONE: Filters = { brands: [], inStock: false, discounted: false };
const PAGE = 24;
const countActive = (f: Filters) => (f.min ? 1 : 0) + (f.max ? 1 : 0) + f.brands.length + (f.inStock ? 1 : 0) + (f.discounted ? 1 : 0);

function FilterSheet({ facets, value, onApply, onClose }: { facets: any; value: Filters; onApply: (f: Filters) => void; onClose: () => void }) {
  const { t } = useApp();
  const [f, setF] = useState<Filters>(value);
  const toggle = (id: string) => setF((x) => ({ ...x, brands: x.brands.includes(id) ? x.brands.filter((b) => b !== id) : [...x.brands, id] }));
  return (
    <Modal transparent animationType="slide" visible onRequestClose={onClose}>
      <Pressable style={styles.scrim} onPress={onClose} />
      <View style={styles.sheet} testID="shop-filter-sheet">
        <AppText weight="bold" size={18}>{t('shf.filters')}</AppText>
        <AppText size={13} color={colors.textMuted}>{t('shf.price')}{facets?.price_min != null ? ` (${Math.round(facets.price_min)} – ${Math.round(facets.price_max)})` : ''}</AppText>
        <View style={styles.row}>
          <TextInput testID="shop-filter-min" placeholder={t('shf.min')} placeholderTextColor={colors.textDim} keyboardType="numeric" value={f.min || ''} onChangeText={(v) => setF({ ...f, min: v.replace(/\D/g, '') })} style={styles.input} />
          <TextInput testID="shop-filter-max" placeholder={t('shf.max')} placeholderTextColor={colors.textDim} keyboardType="numeric" value={f.max || ''} onChangeText={(v) => setF({ ...f, max: v.replace(/\D/g, '') })} style={styles.input} />
        </View>
        {facets?.brands?.length ? <AppText size={13} color={colors.textMuted}>{t('shf.brands')}</AppText> : null}
        {facets?.brands?.length ? <View style={styles.wrap}>{facets.brands.map((b: any) => <Chip key={b.id} testID={`shop-filter-brand-${b.id}`} label={b.name} on={f.brands.includes(b.id)} color={GOLD} onPress={() => toggle(b.id)} />)}</View> : null}
        <View style={styles.wrap}>
          <Chip testID="shop-filter-instock" label={t('shf.in_stock')} on={f.inStock} color={GOLD} onPress={() => setF({ ...f, inStock: !f.inStock })} />
          <Chip testID="shop-filter-discounted" label={t('shf.discounted')} on={f.discounted} color={GOLD} onPress={() => setF({ ...f, discounted: !f.discounted })} />
        </View>
        <View style={styles.row}>
          <View style={{ flex: 1 }}><Button testID="shop-filter-clear" variant="secondary" label={t('shf.clear')} onPress={() => setF(NONE)} /></View>
          <View style={{ flex: 1 }}><Button testID="shop-filter-apply" label={t('shf.apply')} color={GOLD} onPress={() => onApply(f)} /></View>
        </View>
      </View>
    </Modal>
  );
}

export default function ShopCategory() {
  const { slug, sub: subParam, brand } = useLocalSearchParams<{ slug: string; sub?: string; brand?: string }>();
  const { t, lang, country } = useApp();
  const cc = country?.code || 'CI';
  const [sub, setSub] = useState<string | undefined>(subParam);
  const [sort, setSort] = useState<(typeof SORTS)[number]>('relevance');
  const [filters, setFilters] = useState<Filters>(brand ? { ...NONE, brands: [brand] } : NONE);
  const [sheet, setSheet] = useState(false);
  const [items, setItems] = useState<ShopListItem[] | null>(null);
  const [more, setMore] = useState(true);
  const [error, setError] = useState(false);
  const cats = useFetch<any[]>(`/shop/categories?country=${cc}`, [cc]);
  const subs = useFetch<any[]>(slug !== 'all' ? `/shop/subcategories?country=${cc}&category=${slug}` : null, [cc, slug]);
  const scope = `country=${cc}${slug !== 'all' ? `&category=${slug}` : ''}${sub ? `&subcategory=${sub}` : ''}`;
  const facets = useFetch<any>(`/shop/products/facets?${scope}`, [scope]);
  const cat = (Array.isArray(cats.data) ? cats.data : []).find((c) => c.slug === slug);
  const name = (c: any) => (lang === 'en' ? c.name_en || c.name : c.name_fr || c.name);

  const query = `/shop/products?${scope}&sort=${sort}&limit=${PAGE}${filters.min ? `&min_price=${filters.min}` : ''}${filters.max ? `&max_price=${filters.max}` : ''}${filters.brands.length ? `&brand=${filters.brands.join(',')}` : ''}${filters.inStock ? '&in_stock=true' : ''}${filters.discounted ? '&discounted=true' : ''}`;
  const load = useCallback(async (reset: boolean) => {
    setError(false);
    const offset = reset ? 0 : items?.length || 0;
    try {
      const page = await api<ShopListItem[]>(`${query}&offset=${offset}`);
      setItems((prev) => (reset ? page : [...(prev || []), ...page]));
      setMore(page.length === PAGE);
    } catch { setError(true); }
  }, [query, items?.length]);
  useEffect(() => { setItems(null); load(true); }, [query]); // eslint-disable-line react-hooks/exhaustive-deps

  const active = countActive(filters);
  const header = (
    <View style={{ gap: 10, marginBottom: 6 }}>
      {subs.data?.length ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }} testID="shop-subcategories">
          <Chip testID="shop-sub-all" label={t('mart.all')} on={!sub} color={GOLD} onPress={() => setSub(undefined)} />
          {subs.data.map((s) => <Chip key={s.slug} testID={`shop-sub-${s.slug}`} label={name(s)} on={sub === s.slug} color={GOLD} onPress={() => setSub(s.slug)} />)}
        </ScrollView>
      ) : null}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, alignItems: 'center' }}>
        <Touchable testID="shop-filter-open" onPress={() => setSheet(true)} style={[styles.filterBtn, active > 0 && { borderColor: GOLD }]}>
          <SlidersHorizontal color={colors.text} size={16} />
          <AppText size={13} weight="semibold">{t('shf.filters')}{active ? ` (${active})` : ''}</AppText>
        </Touchable>
        {SORTS.map((s) => <Chip key={s} testID={`shop-sort-${s}`} label={t(`shf.sort_${s}` as TKey)} on={sort === s} color={GOLD} onPress={() => setSort(s)} />)}
      </ScrollView>
      {active ? <Touchable testID="shop-filter-clear-all" onPress={() => setFilters(NONE)}><AppText size={13} color={colors.textMuted}>{t('shf.clear_all')}</AppText></Touchable> : null}
    </View>
  );

  return (
    <SafeAreaView style={styles.root} testID="shop-category-screen">
      <ScreenHeader title={cat ? name(cat) : t('mart.all')} right={<CartButton />} />
      {error && !items?.length ? <ErrorView onRetry={() => load(true)} /> : (
        <FlatList testID="shop-product-grid" data={items || []} keyExtractor={(p) => p.id} numColumns={2} ListHeaderComponent={header}
          columnWrapperStyle={{ gap: 10 }} contentContainerStyle={{ padding: 18, gap: 10, paddingBottom: 100 }}
          onEndReached={() => { if (more && items?.length) load(false); }} onEndReachedThreshold={0.4}
          ListEmptyComponent={items === null ? <Skeleton h={240} /> : (
            <StateView testID="shop-empty" title={t('shf.no_results')} action={active ? { label: t('shf.clear_all'), onPress: () => setFilters(NONE) } : undefined} />
          )}
          renderItem={({ item }) => <ShopCard p={item} icon={SHOP_ICONS[slug]} />} />
      )}
      {sheet ? <FilterSheet facets={facets.data} value={filters} onClose={() => setSheet(false)} onApply={(f) => { setFilters(f); setSheet(false); }} /> : null}
      <CartBar color={GOLD} />
    </SafeAreaView>
  );
}

const styles = themed(() => StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  filterBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 36, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  scrim: { flex: 1, backgroundColor: colors.overlay },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 34, gap: 12, borderTopWidth: 1, borderColor: colors.border },
  row: { flexDirection: 'row', gap: 10 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  input: { flex: 1, minWidth: 0, width: 0, height: 46, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bg, color: colors.text, paddingHorizontal: 12, fontFamily: fonts.regular },
}));
