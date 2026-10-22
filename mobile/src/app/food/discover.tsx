import { useLocalSearchParams } from 'expo-router';
import { Search, SlidersHorizontal } from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import { FlatList, Modal, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CartBar, CartButton } from '@/components/commerce/CartBar';
import { RestaurantCard, type Restaurant } from '@/components/commerce/RestaurantCard';
import { FoodModeToggle } from '@/components/module/FoodHomeSections';
import { AppText } from '@/components/ui/AppText';
import { Button, Touchable } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { ErrorView, Skeleton, StateView } from '@/components/ui/StateView';
import { useFetch } from '@/hooks/useFetch';
import { MODULES } from '@/lib/modules';
import { useApp } from '@/state/AppContext';
import { useCart } from '@/state/CartContext';
import { colors, fonts, radius } from '@/theme';

const GREEN = MODULES.food.color;
type Filters = { min_rating?: number; max_price?: number; vegetarian: 'all' | 'veg_options' | 'pure_veg'; open_now: boolean; sort: string };
const DEFAULTS: Filters = { vegetarian: 'all', open_now: false, sort: 'popularity' };
type Cat = { code: string; name_fr: string; name_en: string };

export default function FoodDiscover() {
  const { category, cuisines, focus } = useLocalSearchParams<{ category?: string; cuisines?: string; focus?: string }>();
  const { t, lang, country, address } = useApp();
  const { foodMode } = useCart();
  const cc = country?.code || 'CI';
  const [cat, setCat] = useState(category || '');
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const [filters, setFilters] = useState<Filters>(DEFAULTS);
  const [sheet, setSheet] = useState(false);
  useEffect(() => { const id = setTimeout(() => setDebounced(q.trim()), 300); return () => clearTimeout(id); }, [q]);

  const cats = useFetch<{ items: Cat[] }>(`/food/categories?country=${cc}`, [cc]);
  const qs = [
    `country=${cc}`, `fulfillment_mode=${foodMode}`, 'limit=48', `sort=${filters.sort}`,
    address && `lat=${address.latitude}&lng=${address.longitude}`, cat && cat !== 'all' && `category=${cat}`, cuisines && `cuisines=${encodeURIComponent(cuisines)}`,
    debounced && `query=${encodeURIComponent(debounced)}`, filters.min_rating && `min_rating=${filters.min_rating}`,
    filters.max_price && `max_price=${filters.max_price}`, filters.vegetarian !== 'all' && `vegetarian=${filters.vegetarian}`,
    filters.open_now && 'open_now=true',
  ].filter(Boolean).join('&');
  const { data, loading, error, reload } = useFetch<{ items: Restaurant[]; radius_km: number; total: number }>(`/food/restaurants/discover?${qs}`, [qs]);
  const active = JSON.stringify(filters) !== JSON.stringify(DEFAULTS);

  return (
    <SafeAreaView style={styles.root} testID="food-discover-screen">
      <ScreenHeader title={t('food.discover_title')} right={<CartButton />} />
      <View style={styles.searchRow}>
        <View style={styles.search}>
          <Search color={colors.textMuted} size={18} />
          <TextInput testID="food-search-input" value={q} onChangeText={setQ} autoFocus={!!focus} placeholder={t('explore.ph')}
            placeholderTextColor={colors.textDim} style={styles.input} />
        </View>
        <Touchable testID="food-filters-open" onPress={() => setSheet(true)} style={[styles.filterBtn, active && { borderColor: GREEN }]}>
          <SlidersHorizontal color={active ? GREEN : colors.text} size={20} />
        </Touchable>
      </View>
      <FoodModeToggle />
      <View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {(cats.data?.items || []).map((c) => (
            <Chip key={c.code} testID={`food-cat-${c.code}`} label={lang === 'en' ? c.name_en : c.name_fr}
              on={(cat || 'all') === c.code} color={GREEN} onPress={() => setCat(c.code)} />
          ))}
        </ScrollView>
      </View>
      {data?.radius_km ? <AppText size={12} color={colors.textMuted} style={{ paddingHorizontal: 18, marginBottom: 8 }}>{t('food.radius', { km: data.radius_km })}</AppText> : null}
      {error ? <ErrorView onRetry={reload} /> : (
        <FlatList
          testID="food-restaurant-list"
          data={loading ? [] : data?.items || []}
          keyExtractor={(r) => r.id}
          contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: 100, gap: 12 }}
          ListEmptyComponent={loading ? <View style={{ gap: 12 }}><Skeleton h={220} /><Skeleton h={220} /></View> : <StateView testID="food-empty" title={t('food.no_results')} />}
          renderItem={({ item }) => <RestaurantCard r={item} mode={foodMode} />}
        />
      )}
      <FilterSheet visible={sheet} value={filters} onClose={() => setSheet(false)} onApply={(f) => { setFilters(f); setSheet(false); }} />
      <CartBar color={GREEN} />
    </SafeAreaView>
  );
}

function FilterSheet({ visible, value, onClose, onApply }: { visible: boolean; value: Filters; onClose: () => void; onApply: (f: Filters) => void }) {
  const { t } = useApp();
  const [f, setF] = useState(value);
  useEffect(() => { if (visible) setF(value); }, [visible, value]);
  const row = (label: string, children: React.ReactNode) => (
    <View style={{ gap: 10, marginBottom: 18 }}><AppText weight="bold" size={15}>{label}</AppText><View style={styles.wrapRow}>{children}</View></View>
  );
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Touchable testID="food-filters-backdrop" onPress={onClose} style={styles.backdrop} scale={1}><View /></Touchable>
      <View style={styles.sheet} testID="food-filters-sheet">
        <AppText weight="black" size={22} style={{ marginBottom: 18 }}>{t('food.filters')}</AppText>
        <ScrollView>
          {row(t('food.sort'), (['popularity', 'rating', 'distance', 'delivery_time'] as const).map((s) => (
            <Chip key={s} testID={`food-sort-${s}`} label={t(`food.sort.${s}` as any)} on={f.sort === s} color={GREEN} onPress={() => setF({ ...f, sort: s })} />)))}
          {row(t('food.rating'), [3.5, 4, 4.5].map((r) => (
            <Chip key={r} testID={`food-rating-${r}`} label={`${r}+`} on={f.min_rating === r} color={GREEN} onPress={() => setF({ ...f, min_rating: f.min_rating === r ? undefined : r })} />)))}
          {row(t('food.price'), [2000, 5000, 10000].map((p) => (
            <Chip key={p} testID={`food-price-${p}`} label={`≤ ${p.toLocaleString('fr-FR')}`} on={f.max_price === p} color={GREEN} onPress={() => setF({ ...f, max_price: f.max_price === p ? undefined : p })} />)))}
          {row(t('food.diet'), (['all', 'veg_options', 'pure_veg'] as const).map((v) => (
            <Chip key={v} testID={`food-diet-${v}`} label={t(`food.diet.${v}`)} on={f.vegetarian === v} color={GREEN} onPress={() => setF({ ...f, vegetarian: v })} />)))}
          {row(t('food.open_now'), <Chip testID="food-open-now" label={t('food.open_now')} on={f.open_now} color={GREEN} onPress={() => setF({ ...f, open_now: !f.open_now })} />)}
        </ScrollView>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <View style={{ flex: 1 }}><Button testID="food-filters-reset" variant="secondary" label={t('food.reset')} onPress={() => setF(DEFAULTS)} /></View>
          <View style={{ flex: 1 }}><Button testID="food-filters-apply" label={t('food.apply')} color={GREEN} onPress={() => onApply(f)} /></View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  searchRow: { flexDirection: 'row', gap: 10, paddingHorizontal: 18 },
  search: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, height: 48, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  input: { flex: 1, minWidth: 0, height: '100%', color: colors.text, fontFamily: fonts.regular, fontSize: 15, outlineStyle: 'none' } as any,
  filterBtn: { width: 48, height: 48, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  chips: { gap: 8, paddingHorizontal: 18, paddingVertical: 12 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' },
  sheet: { maxHeight: '80%', backgroundColor: '#111113', borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 20, paddingBottom: 30, borderTopWidth: 1, borderColor: colors.border },
  wrapRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
