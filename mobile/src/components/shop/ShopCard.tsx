import { router } from 'expo-router';
import { Plus } from 'lucide-react-native';
import React, { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { useFetch } from '@/hooks/useFetch';
import { formatMoney } from '@/lib/format';
import { MODULES } from '@/lib/modules';
import { notify } from '@/lib/notify';
import { useApp } from '@/state/AppContext';
import { useCart } from '@/state/CartContext';
import { colors, radius, themed } from '@/theme';
import { QtyStepper } from '../commerce/QtyStepper';
import { Thumb } from '../commerce/Thumb';
import { AppText } from '../ui/AppText';
import { Button, Touchable } from '../ui/Button';
import { Chip } from '../ui/Chip';

const GOLD = MODULES.shop.color;
export type ShopListItem = { id: string; title: string; title_fr?: string; images: string[]; min_price: number; compare_at_price?: number | null;
  currency: string; first_variant_id?: string | null; variant_count: number; in_stock: boolean; stock_qty: number; discount_pct: number };
type V = { id: string; title_suffix?: string; price: number; compare_at_price?: number | null; currency: string; stock_qty: number; images: string[]; is_active: boolean };

// Size/colour picker shown when a product has several variants (no forced trip to the details page).
function VariantSheet({ p, title, onClose }: { p: ShopListItem; title: string; onClose: () => void }) {
  const { t, lang } = useApp();
  const { setShopQty } = useCart();
  const { data } = useFetch<{ variants: V[] }>(`/shop/products/${p.id}`, [p.id]);
  const vs = (data?.variants || []).filter((v) => v.is_active);
  const [vid, setVid] = useState<string | null>(null);
  const [qty, setQty] = useState(1);
  const [busy, setBusy] = useState(false);
  const v = vs.find((x) => x.id === vid);
  const add = async () => {
    if (!v) return;
    setBusy(true);
    try {
      await setShopQty({ id: v.id, price: v.price, currency: v.currency, title_suffix: v.title_suffix, image: v.images?.[0] || p.images?.[0], product_id: p.id, product_title: title }, Math.min(qty, v.stock_qty));
      notify(t('shf.added')); onClose();
    } catch (e: any) { notify(e?.message || t('common.network_error')); }
    setBusy(false);
  };
  return (
    <Modal transparent animationType="slide" visible onRequestClose={onClose}>
      <Pressable style={styles.scrim} onPress={onClose} testID="shop-variant-sheet-close" />
      <View style={styles.sheet} testID="shop-variant-sheet">
        <AppText weight="bold" size={17} numberOfLines={2}>{title}</AppText>
        <AppText size={13} color={colors.textMuted}>{t('shf.choose_variant')}</AppText>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 6 }}>
          {vs.map((x) => (
            <Chip key={x.id} testID={`shop-sheet-variant-${x.id}`} label={`${x.title_suffix || '—'}${x.stock_qty <= 0 ? ` · ${t('shf.out')}` : ''}`}
              on={vid === x.id} color={GOLD} onPress={() => x.stock_qty > 0 && setVid(x.id)} />
          ))}
        </ScrollView>
        {v ? <AppText weight="bold" size={18} testID="shop-sheet-price">{formatMoney(v.price, v.currency, undefined, lang)}</AppText> : null}
        {v ? <AppText size={12} color={v.stock_qty <= 5 ? colors.danger : colors.textMuted}>{t('shf.stock', { n: v.stock_qty })}</AppText> : null}
        <View style={styles.sheetRow}>
          <QtyStepper qty={qty} onChange={(q) => setQty(Math.max(1, q))} color={GOLD} max={v?.stock_qty || 1} testID="shop-sheet-qty" />
          <View style={{ flex: 1 }}><Button testID="shop-sheet-add" label={t('shf.add_to_cart')} disabled={!v} loading={busy} color={GOLD} onPress={add} /></View>
        </View>
      </View>
    </Modal>
  );
}

export function ShopCard({ p, icon }: { p: ShopListItem; icon?: any }) {
  const { t, lang } = useApp();
  const { shop, setShopQty } = useCart();
  const [sheet, setSheet] = useState(false);
  const title = lang === 'fr' ? p.title_fr || p.title : p.title;
  const line = p.variant_count === 1 ? shop.find((l) => l.variant_id === p.first_variant_id) : null;
  const single = (q: number) => p.first_variant_id && setShopQty({ id: p.first_variant_id, price: p.min_price, currency: p.currency, image: p.images?.[0], product_id: p.id, product_title: title }, Math.min(q, p.stock_qty))
    .catch((e) => notify(e?.message || t('common.network_error')));
  return (
    <Touchable testID={`shop-product-${p.id}`} onPress={() => router.push(`/shop/product/${p.id}`)} style={styles.card} scale={0.98}>
      <View style={styles.img}>
        <Thumb src={p.images?.[0]} color={GOLD} icon={icon} testID={`shop-product-img-${p.id}`} />
        {p.discount_pct ? <View style={styles.badge}><AppText size={11} weight="bold" color="#000">-{p.discount_pct}%</AppText></View> : null}
        {!p.in_stock ? <View style={styles.out}><AppText size={11} weight="bold" color="#fff">{t('shf.out')}</AppText></View> : null}
      </View>
      <AppText weight="semibold" size={13} numberOfLines={2} style={{ minHeight: 34 }}>{title}</AppText>
      <View style={styles.priceRow}>
        <View style={{ flex: 1 }}>
          <AppText weight="bold" size={14}>{formatMoney(p.min_price, p.currency, undefined, lang)}</AppText>
          {p.compare_at_price && p.compare_at_price > p.min_price ? (
            <AppText size={11} color={colors.textDim} style={{ textDecorationLine: 'line-through' }}>{formatMoney(p.compare_at_price, p.currency, undefined, lang)}</AppText>
          ) : null}
        </View>
        {!p.in_stock ? null : line ? (
          <QtyStepper size="sm" qty={line.quantity} onChange={single} color={GOLD} max={p.stock_qty} testID={`shop-qty-${p.id}`} />
        ) : (
          <Touchable testID={`shop-add-${p.id}`} accessibilityLabel={t('shf.add_to_cart')} onPress={() => (p.variant_count > 1 ? setSheet(true) : single(1))} style={styles.plus} hitSlop={6}>
            <Plus color="#000" size={18} strokeWidth={2.6} />
          </Touchable>
        )}
      </View>
      {p.variant_count > 1 ? <AppText size={11} color={colors.textMuted}>{t('shf.options', { n: p.variant_count })}</AppText> : null}
      {sheet ? <VariantSheet p={p} title={title} onClose={() => setSheet(false)} /> : null}
    </Touchable>
  );
}

const styles = themed(() => StyleSheet.create({
  card: { flex: 1, maxWidth: '50%', padding: 10, gap: 4, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  img: { width: '100%', aspectRatio: 1, borderRadius: 12, overflow: 'hidden', backgroundColor: colors.surface2, marginBottom: 6 },
  badge: { position: 'absolute', top: 6, left: 6, backgroundColor: GOLD, borderRadius: 999, paddingHorizontal: 7, paddingVertical: 1 },
  out: { position: 'absolute', bottom: 6, left: 6, backgroundColor: 'rgba(0,0,0,0.7)', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  plus: { width: 34, height: 34, borderRadius: 17, backgroundColor: GOLD, alignItems: 'center', justifyContent: 'center' },
  scrim: { flex: 1, backgroundColor: colors.overlay },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 34, gap: 10, borderTopWidth: 1, borderColor: colors.border },
  sheetRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 6 },
}));
