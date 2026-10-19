import { useLocalSearchParams } from 'expo-router';
import { Search } from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import { FlatList, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CartBar, CartButton } from '@/components/commerce/CartBar';
import { ProductCard } from '@/components/commerce/ProductCard';
import { Chip } from '@/components/ui/Chip';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { ErrorView, Skeleton, StateView } from '@/components/ui/StateView';
import { useFetch } from '@/hooks/useFetch';
import { MODULES } from '@/lib/modules';
import { useApp } from '@/state/AppContext';
import type { MartProduct } from '@/state/CartContext';
import { colors, fonts, radius } from '@/theme';

const GREEN = MODULES.mart.color;
const SORTS = ['popularity', 'price_asc', 'price_desc'] as const;
type Cat = { slug: string; name_fr?: string; name_en?: string; name?: string };

export default function MartCategory() {
  const { slug, focus } = useLocalSearchParams<{ slug: string; focus?: string }>();
  const { t, lang, country } = useApp();
  const cc = country?.code || 'CI';
  const [cat, setCat] = useState(slug === 'all' ? '' : slug);
  const [sub, setSub] = useState('');
  const [sort, setSort] = useState<(typeof SORTS)[number]>('popularity');
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  useEffect(() => { const id = setTimeout(() => setDebounced(q.trim()), 300); return () => clearTimeout(id); }, [q]);

  const name = (c: Cat) => (lang === 'en' ? c.name_en : c.name_fr) || c.name || c.slug;
  const cats = useFetch<Cat[]>(`/mart/categories?country=${cc}`, [cc]);
  const subs = useFetch<Cat[]>(cat ? `/mart/subcategories?country=${cc}&category=${cat}` : null, [cat]);
  const params = [`country=${cc}`, `sort=${sort}`, 'limit=60', cat && `category=${cat}`, sub && `subcategory=${sub}`, debounced && `search=${encodeURIComponent(debounced)}`].filter(Boolean).join('&');
  const products = useFetch<MartProduct[]>(`/mart/products?${params}`, [params]);
  const title = cat ? name(cats.data?.find((c) => c.slug === cat) || { slug: cat }) : t('mart.all');

  return (
    <SafeAreaView style={styles.root} testID="mart-category-screen">
      <ScreenHeader title={title} right={<CartButton />} />
      <View style={styles.search}>
        <Search color={colors.textMuted} size={18} />
        <TextInput testID="mart-search-input" value={q} onChangeText={setQ} placeholder={t('mart.search_ph')} placeholderTextColor={colors.textDim}
          autoFocus={!!focus} style={styles.input} returnKeyType="search" />
      </View>
      <View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          <Chip testID="mart-cat-all" label={t('activity.all')} on={!cat} color={GREEN} onPress={() => { setCat(''); setSub(''); }} />
          {(cats.data || []).map((c) => (
            <Chip key={c.slug} testID={`mart-cat-${c.slug}`} label={name(c)} on={cat === c.slug} color={GREEN} onPress={() => { setCat(c.slug); setSub(''); }} />
          ))}
        </ScrollView>
        {subs.data?.length ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[styles.chips, { paddingTop: 0 }]}>
            {subs.data.map((s) => (
              <Chip key={s.slug} testID={`mart-sub-${s.slug}`} label={name(s)} on={sub === s.slug} color={GREEN} onPress={() => setSub(sub === s.slug ? '' : s.slug)} />
            ))}
          </ScrollView>
        ) : null}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[styles.chips, { paddingTop: 0 }]}>
          {SORTS.map((s) => <Chip key={s} testID={`mart-sort-${s}`} label={t(`mart.sort.${s}` as any)} on={sort === s} onPress={() => setSort(s)} />)}
        </ScrollView>
      </View>
      {products.error ? <ErrorView onRetry={products.reload} /> : (
        <FlatList
          testID="mart-product-grid"
          data={products.loading ? [] : products.data || []}
          keyExtractor={(p) => p.id}
          numColumns={2}
          columnWrapperStyle={{ gap: 10 }}
          contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: 100, gap: 10 }}
          ListEmptyComponent={products.loading
            ? <View style={{ flexDirection: 'row', gap: 10 }}><View style={{ flex: 1 }}><Skeleton h={240} /></View><View style={{ flex: 1 }}><Skeleton h={240} /></View></View>
            : <StateView testID="mart-empty" title={t('mart.no_products')} />}
          renderItem={({ item }) => <View style={{ flex: 1, maxWidth: '50%' }}><ProductCard p={item} width="100%" /></View>}
        />
      )}
      <CartBar color={GREEN} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  search: { flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: 18, paddingHorizontal: 14, height: 48, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  input: { flex: 1, minWidth: 0, height: '100%', color: colors.text, fontFamily: fonts.regular, fontSize: 15, outlineStyle: 'none' } as any,
  chips: { gap: 8, paddingHorizontal: 18, paddingVertical: 12 },
});
