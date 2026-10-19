import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CartButton } from '@/components/commerce/CartBar';
import { QtyStepper } from '@/components/commerce/QtyStepper';
import { Thumb } from '@/components/commerce/Thumb';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { ErrorView, Skeleton } from '@/components/ui/StateView';
import { useFetch } from '@/hooks/useFetch';
import { formatMoney } from '@/lib/format';
import { MODULES } from '@/lib/modules';
import { notify } from '@/lib/notify';
import { useApp } from '@/state/AppContext';
import { useCart } from '@/state/CartContext';
import { colors, radius } from '@/theme';

const GOLD = MODULES.shop.color;
type V = { id: string; title_suffix?: string; price: number; compare_at_price?: number | null; currency: string; stock_qty: number; images: string[]; is_active: boolean };
type P = { id: string; title: string; title_fr?: string; description?: string; description_fr?: string; images: string[]; variants: V[] };

export default function ShopProduct() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, lang } = useApp();
  const { width } = useWindowDimensions();
  const { shop, setShopQty } = useCart();
  const { data: p, loading, error, reload } = useFetch<P>(`/shop/products/${id}`, [id]);
  const [vid, setVid] = useState<string | null>(null);
  useEffect(() => { if (p && !vid) setVid(p.variants.find((v) => v.is_active && v.stock_qty > 0)?.id || p.variants[0]?.id || null); }, [p, vid]);

  const v = p?.variants.find((x) => x.id === vid);
  const title = p ? (lang === 'fr' ? p.title_fr || p.title : p.title) : '';
  const qty = shop.find((l) => l.variant_id === vid)?.quantity || 0;
  const images = [...(v?.images || []), ...(p?.images || [])].filter((x, i, a) => a.indexOf(x) === i);
  const out = !v || !v.is_active || v.stock_qty <= 0;
  const change = (q: number) => v && p && setShopQty({ id: v.id, price: v.price, currency: v.currency, title_suffix: v.title_suffix, image: images[0], product_id: p.id, product_title: title }, Math.min(q, v.stock_qty))
    .catch((e) => notify(e?.message || t('common.network_error')));

  return (
    <SafeAreaView style={styles.root} testID="shop-product-screen">
      <ScreenHeader title="" right={<CartButton />} />
      {error ? <ErrorView onRetry={reload} /> : loading || !p ? <View style={{ padding: 18 }}><Skeleton h={300} /></View> : (
        <ScrollView contentContainerStyle={{ paddingBottom: 120 }}>
          <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false}>
            {(images.length ? images : ['']).map((src, i) => <View key={src || i} style={{ width, height: 320 }}><Thumb src={src} color={GOLD} size={64} testID={`shop-product-img-${i}`} /></View>)}
          </ScrollView>
          <View style={{ padding: 18, gap: 8 }}>
            <AppText weight="black" size={22} testID="shop-product-title">{title}</AppText>
            {v ? (
              <View style={styles.row}>
                <AppText weight="black" size={24} testID="shop-product-price">{formatMoney(v.price, v.currency, undefined, lang)}</AppText>
                {v.compare_at_price && v.compare_at_price > v.price ? <AppText size={15} color={colors.textDim} style={{ textDecorationLine: 'line-through' }}>{formatMoney(v.compare_at_price, v.currency, undefined, lang)}</AppText> : null}
              </View>
            ) : null}
            {p.variants.length > 1 ? (
              <View style={styles.wrap}>
                {p.variants.map((x) => <Chip key={x.id} testID={`shop-variant-${x.id}`} label={x.title_suffix || x.id} on={vid === x.id} color={GOLD} onPress={() => setVid(x.id)} />)}
              </View>
            ) : null}
            {v ? <AppText size={12} color={out ? colors.danger : colors.textMuted}>{out ? t('mart.out_of_stock') : `${v.stock_qty} en stock`}</AppText> : null}
            {(lang === 'fr' ? p.description_fr || p.description : p.description) ? (
              <AppText size={14} color={colors.textMuted} style={{ marginTop: 10 }}>{lang === 'fr' ? p.description_fr || p.description : p.description}</AppText>
            ) : null}
          </View>
        </ScrollView>
      )}
      {v ? (
        <View style={styles.footer}>
          {qty > 0 ? (
            <View style={[styles.row, { gap: 12 }]}>
              <QtyStepper qty={qty} onChange={change} color={GOLD} testID="shop-product-qty" max={v.stock_qty} />
              <View style={{ flex: 1 }}><Button testID="shop-product-go-cart" label={t('cart.view')} color={GOLD} onPress={() => router.push('/cart')} /></View>
            </View>
          ) : <Button testID="shop-product-add" label={out ? t('mart.out_of_stock') : t('mart.add')} disabled={out} color={GOLD} onPress={() => change(1)} />}
        </View>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6 },
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: 16, paddingBottom: 26, backgroundColor: '#0B0B0D', borderTopWidth: 1, borderTopColor: colors.border, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg },
});
