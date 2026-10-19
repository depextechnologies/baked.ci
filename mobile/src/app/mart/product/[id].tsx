import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { Star } from 'lucide-react-native';
import React, { useState } from 'react';
import { ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CartBar, CartButton } from '@/components/commerce/CartBar';
import { useMartAdd } from '@/components/commerce/ProductCard';
import { QtyStepper } from '@/components/commerce/QtyStepper';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { ErrorView, Skeleton } from '@/components/ui/StateView';
import { useFetch } from '@/hooks/useFetch';
import { formatMoney } from '@/lib/format';
import { MODULES } from '@/lib/modules';
import { useApp } from '@/state/AppContext';
import { useCart, type MartProduct } from '@/state/CartContext';
import { colors, radius } from '@/theme';

const GREEN = MODULES.mart.color;
type Product = MartProduct & { images?: string[]; description?: string; brand?: string; rating?: number; review_count?: number };

export default function MartProductScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, lang } = useApp();
  const { width } = useWindowDimensions();
  const { martQty } = useCart();
  const change = useMartAdd();
  const [page, setPage] = useState(0);
  const { data: p, loading, error, reload } = useFetch<Product>(`/mart/products/${id}`, [id]);
  const qty = p ? martQty(p.id) : 0;
  const images = p?.images?.length ? p.images : p?.image ? [p.image] : [];

  return (
    <SafeAreaView style={styles.root} testID="mart-product-screen">
      <ScreenHeader title="" right={<CartButton />} />
      {error ? <ErrorView onRetry={reload} /> : loading || !p ? <View style={{ padding: 18, gap: 12 }}><Skeleton h={300} /><Skeleton h={30} w="70%" /></View> : (
        <ScrollView contentContainerStyle={{ paddingBottom: 120 }}>
          <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={(e) => setPage(Math.round(e.nativeEvent.contentOffset.x / width))}>
            {images.map((src) => (
              <View key={src} style={[styles.imgBox, { width }]}><Image source={src} style={StyleSheet.absoluteFill} contentFit="contain" /></View>
            ))}
          </ScrollView>
          {images.length > 1 ? <View style={styles.dots}>{images.map((s, i) => <View key={s} style={[styles.dot, i === page && { backgroundColor: GREEN, width: 18 }]} />)}</View> : null}
          <View style={styles.body}>
            {p.brand ? <AppText size={12} color={colors.textMuted}>{p.brand}</AppText> : null}
            <AppText weight="black" size={24} testID="mart-product-name">{p.name}</AppText>
            <AppText size={14} color={colors.textMuted}>{p.unit}</AppText>
            {p.rating ? (
              <View style={styles.row}><Star color="#FCC44C" fill="#FCC44C" size={14} /><AppText weight="semibold" size={13}>{p.rating}</AppText>
                <AppText size={13} color={colors.textMuted}>· {t('mart.reviews', { n: p.review_count || 0 })}</AppText></View>
            ) : null}
            <View style={[styles.row, { marginTop: 10 }]}>
              <AppText weight="black" size={26} testID="mart-product-price">{formatMoney(p.price, p.currency, p.currency_symbol, lang)}</AppText>
              {p.was_price && p.was_price > p.price ? <AppText size={15} color={colors.textDim} style={{ textDecorationLine: 'line-through' }}>{formatMoney(p.was_price, p.currency, p.currency_symbol, lang)}</AppText> : null}
              {p.badge ? <View style={styles.badge}><AppText weight="bold" size={11} color="#000">{p.badge}</AppText></View> : null}
            </View>
            {p.description ? (
              <>
                <AppText weight="bold" size={16} style={{ marginTop: 20 }}>{t('mart.description')}</AppText>
                <AppText size={14} color={colors.textMuted} style={{ marginTop: 6 }}>{p.description}</AppText>
              </>
            ) : null}
          </View>
        </ScrollView>
      )}
      {p ? (
        <View style={styles.footer}>
          {qty > 0 ? (
            <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
              <QtyStepper qty={qty} onChange={(q) => change(p, q)} color={GREEN} testID="mart-product-qty" />
              <View style={{ flex: 1 }}><CartBarInline /></View>
            </View>
          ) : (
            <Button testID="mart-product-add" label={p.in_stock === false ? t('mart.out_of_stock') : t('mart.add')} disabled={p.in_stock === false}
              color={GREEN} onPress={() => change(p, 1)} />
          )}
        </View>
      ) : <CartBar color={GREEN} />}
    </SafeAreaView>
  );
}

function CartBarInline() {
  const { t } = useApp();
  return <Button testID="mart-product-go-cart" label={t('cart.view')} color={GREEN} onPress={() => router.push('/cart')} />;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  imgBox: { height: 300, backgroundColor: '#fff' },
  dots: { flexDirection: 'row', gap: 6, justifyContent: 'center', marginTop: 10 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#3A3A40' },
  body: { padding: 18, gap: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  badge: { backgroundColor: GREEN, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: 16, paddingBottom: 26, backgroundColor: '#0B0B0D', borderTopWidth: 1, borderTopColor: colors.border, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg },
});
