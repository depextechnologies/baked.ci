import { router } from 'expo-router';
import { Plus } from 'lucide-react-native';
import React from 'react';
import { ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';

import { useFetch } from '@/hooks/useFetch';
import { absUrl, nativeLink, sectionText } from '@/lib/cms';
import { formatMoney } from '@/lib/format';
import { notify } from '@/lib/notify';
import { useApp } from '@/state/AppContext';
import { useCart } from '@/state/CartContext';
import { colors } from '@/theme';
import { Thumb } from '../commerce/Thumb';
import { AppText } from '../ui/AppText';
import { Touchable } from '../ui/Button';
import { SectionHeader } from './SectionHeader';
import type { SectionProps } from './types';

// Website parity: one horizontal rail, 2 / 3 / 4 cards per screen; config.filter = category slug or new/bestsellers.
export function ProductCarousel({ section, accent, module, country, width }: SectionProps) {
  const { t, lang } = useApp();
  const { width: screen } = useWindowDimensions();
  const cfg = section.config || {};
  const limit = cfg.limit || 12;
  const keyword = !cfg.filter || ['new', 'bestsellers'].includes(cfg.filter);
  const q = `/shop/products?country=${country}&limit=${limit}${keyword ? '' : `&category=${cfg.filter}`}${cfg.subcategory ? `&subcategory=${cfg.subcategory}` : ''}`;
  const { data } = useFetch<any[]>(q, [q]);
  const per = screen >= 1000 ? 4 : screen >= 700 ? 3 : 2.15;
  const cardW = (width - 12 * (Math.ceil(per) - 1)) / per;
  const to = cfg.view_all_link || cfg.link ? nativeLink(cfg.view_all_link || cfg.link, module) : keyword ? '/shop/category/all' : `/shop/category/${cfg.filter}`;
  return (
    <View testID={`cms-product-carousel-${section.id}`}>
      <SectionHeader testID="cms-product-carousel" title={sectionText(section, 'title', lang)} subtitle={sectionText(section, 'subtitle', lang)} accent={accent} to={to} />
      {data && !data.length ? <AppText size={13} color={colors.textMuted}>{t('cms.no_products')}</AppText> : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12 }} snapToInterval={cardW + 12} decelerationRate="fast">
          {(data || []).map((p) => <ProductTile key={p.id} p={p} w={cardW} accent={accent} />)}
        </ScrollView>
      )}
    </View>
  );
}

function ProductTile({ p, w, accent }: { p: any; w: number; accent: string }) {
  const { t, lang } = useApp();
  const { shop, setShopQty } = useCart();
  const title = lang === 'fr' ? p.title_fr || p.title : p.title || p.title_fr;
  const off = p.compare_at_price > p.min_price ? Math.round(((p.compare_at_price - p.min_price) / p.compare_at_price) * 100) : 0;
  const add = () => {
    const qty = shop.find((l) => l.variant_id === p.first_variant_id)?.quantity || 0;
    setShopQty({ id: p.first_variant_id, price: p.min_price, currency: p.currency || 'XOF', image: p.images?.[0], product_id: p.id, product_title: title }, qty + 1)
      .then(() => notify(title, t('cart.added')))
      .catch((e) => notify(e?.message || t('common.network_error')));
  };
  return (
    <Touchable testID={`cms-product-${p.id}`} onPress={() => router.push(`/shop/product/${p.id}` as any)} style={[styles.card, { width: w }]} scale={0.98}>
      <View style={styles.img}>
        <Thumb src={absUrl(p.images?.[0])} color={accent} />
        {off > 0 ? <View style={styles.off}><AppText size={10} weight="bold" color="#fff">−{off}%</AppText></View> : null}
      </View>
      <View style={{ padding: 10, gap: 4 }}>
        <AppText weight="semibold" size={13} numberOfLines={2} style={{ minHeight: 34 }}>{title}</AppText>
        {p.variant_count > 1 ? <AppText size={11} color={colors.textMuted} numberOfLines={1}>{t('cms.options', { n: p.variant_count - 1 })}</AppText> : null}
        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <AppText weight="bold" size={13}>{formatMoney(p.min_price, p.currency, undefined, lang)}</AppText>
            {off > 0 ? <AppText size={11} color={colors.textDim} style={{ textDecorationLine: 'line-through' }}>{formatMoney(p.compare_at_price, p.currency, undefined, lang)}</AppText> : null}
          </View>
          {p.first_variant_id ? <Touchable testID={`cms-product-add-${p.id}`} onPress={add} style={[styles.add, { backgroundColor: accent }]} hitSlop={6}><Plus color="#000" size={18} strokeWidth={3} /></Touchable> : null}
        </View>
      </View>
    </Touchable>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderColor: colors.border, borderRadius: 12, overflow: 'hidden', backgroundColor: colors.surface },
  img: { width: '100%', aspectRatio: 1, backgroundColor: colors.surface2 },
  off: { position: 'absolute', top: 8, left: 8, backgroundColor: '#FF4C52', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginTop: 4 },
  add: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
});
