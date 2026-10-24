import { Image } from 'expo-image';
import { router } from 'expo-router';
import React from 'react';
import { StyleSheet, View } from 'react-native';

import { formatMoney } from '@/lib/format';
import { MODULES } from '@/lib/modules';
import { notify } from '@/lib/notify';
import { useApp } from '@/state/AppContext';
import { useCart, type MartProduct } from '@/state/CartContext';
import { colors, radius, themed } from '@/theme';
import { AppText } from '../ui/AppText';
import { Touchable } from '../ui/Button';
import { AddButton, QtyStepper } from './QtyStepper';

const GREEN = MODULES.mart.color;

export function useMartAdd() {
  const { setMartQty } = useCart();
  const { t } = useApp();
  return (p: MartProduct, qty: number) => setMartQty(p, qty).catch((e) => notify(e?.message || t('common.network_error')));
}

export function ProductCard({ p, width }: { p: MartProduct; width: number | `${number}%` }) {
  const { t, lang } = useApp();
  const { martQty } = useCart();
  const change = useMartAdd();
  const qty = martQty(p.id);
  const out = p.in_stock === false;

  return (
    <Touchable testID={`product-card-${p.id}`} onPress={() => router.push(`/mart/product/${p.id}`)} style={[styles.card, { width }]} scale={0.98}>
      <View style={styles.imgBox}>
        {p.image ? <Image source={p.image} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} /> : null}
        {p.badge ? <View style={styles.badge}><AppText weight="bold" size={10} color="#000">{p.badge}</AppText></View> : null}
      </View>
      <AppText weight="semibold" size={13} numberOfLines={2} style={{ minHeight: 34 }}>{p.name}</AppText>
      <AppText size={11} color={colors.textMuted}>{p.unit}</AppText>
      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <AppText weight="bold" size={14} testID={`product-price-${p.id}`}>{formatMoney(p.price, p.currency, p.currency_symbol, lang)}</AppText>
          {p.was_price && p.was_price > p.price ? (
            <AppText size={11} color={colors.textDim} style={{ textDecorationLine: 'line-through' }}>{formatMoney(p.was_price, p.currency, p.currency_symbol, lang)}</AppText>
          ) : null}
        </View>
      </View>
      {qty > 0 ? <QtyStepper size="sm" qty={qty} onChange={(q) => change(p, q)} color={GREEN} testID={`product-qty-${p.id}`} />
        : <AddButton testID={`product-add-${p.id}`} label={out ? t('mart.out_of_stock') : t('mart.add')} disabled={out} color={GREEN} onPress={() => change(p, 1)} />}
    </Touchable>
  );
}

const styles = themed(() => StyleSheet.create({
  card: { padding: 10, gap: 4, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  imgBox: { width: '100%', aspectRatio: 1, borderRadius: 12, overflow: 'hidden', backgroundColor: '#fff', marginBottom: 6 },
  badge: { position: 'absolute', top: 6, left: 6, backgroundColor: GREEN, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  row: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
}));
