import { router, useLocalSearchParams } from 'expo-router';
import React from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CartBar, CartButton } from '@/components/commerce/CartBar';
import { Thumb } from '@/components/commerce/Thumb';
import { SHOP_ICONS } from '@/components/module/moduleData';
import { AppText } from '@/components/ui/AppText';
import { Touchable } from '@/components/ui/Button';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { ErrorView, Skeleton, StateView } from '@/components/ui/StateView';
import { useFetch } from '@/hooks/useFetch';
import { formatMoney } from '@/lib/format';
import { MODULES } from '@/lib/modules';
import { useApp } from '@/state/AppContext';
import { colors, radius, themed } from '@/theme';

type P = { id: string; title: string; title_fr?: string; images: string[]; min_price: number; compare_at_price?: number | null; currency: string };

export default function ShopCategory() {
  const { slug, sub } = useLocalSearchParams<{ slug: string; sub?: string }>();
  const { t, lang, country } = useApp();
  const cc = country?.code || 'CI';
  const q = `/shop/products?country=${cc}&limit=60${slug !== 'all' ? `&category=${slug}` : ''}${sub ? `&subcategory=${sub}` : ''}`;
  const { data, loading, error, reload } = useFetch<P[]>(q, [q]);
  const cats = useFetch<any[]>(`/shop/categories?country=${cc}`, [cc]);
  const cat = (Array.isArray(cats.data) ? cats.data : []).find((c) => c.slug === slug);

  return (
    <SafeAreaView style={styles.root} testID="shop-category-screen">
      <ScreenHeader title={cat ? (lang === 'en' ? cat.name_en || cat.name : cat.name_fr || cat.name) : t('mart.all')} right={<CartButton />} />
      {error ? <ErrorView onRetry={reload} /> : (
        <FlatList testID="shop-product-grid" data={loading ? [] : data || []} keyExtractor={(p) => p.id} numColumns={2}
          columnWrapperStyle={{ gap: 10 }} contentContainerStyle={{ padding: 18, gap: 10, paddingBottom: 100 }}
          ListEmptyComponent={loading ? <Skeleton h={240} /> : <StateView testID="shop-empty" title={t('mart.no_products')} />}
          renderItem={({ item: p }) => (
            <Touchable testID={`shop-product-${p.id}`} onPress={() => router.push(`/shop/product/${p.id}`)} style={styles.card} scale={0.98}>
              <View style={styles.img}><Thumb src={p.images?.[0]} color={MODULES.shop.color} icon={SHOP_ICONS[slug]} testID={`shop-product-img-${p.id}`} /></View>
              <AppText weight="semibold" size={13} numberOfLines={2} style={{ minHeight: 34 }}>{lang === 'fr' ? p.title_fr || p.title : p.title}</AppText>
              <AppText weight="bold" size={14}>{formatMoney(p.min_price, p.currency, undefined, lang)}</AppText>
              {p.compare_at_price && p.compare_at_price > p.min_price ? (
                <AppText size={11} color={colors.textDim} style={{ textDecorationLine: 'line-through' }}>{formatMoney(p.compare_at_price, p.currency, undefined, lang)}</AppText>
              ) : null}
            </Touchable>
          )} />
      )}
      <CartBar color={MODULES.shop.color} />
    </SafeAreaView>
  );
}

const styles = themed(() => StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  card: { flex: 1, maxWidth: '50%', padding: 10, gap: 4, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  img: { width: '100%', aspectRatio: 1, borderRadius: 12, overflow: 'hidden', backgroundColor: colors.surface2, marginBottom: 6 },
}));
