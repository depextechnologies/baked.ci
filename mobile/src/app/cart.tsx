import { Image } from 'expo-image';
import { router } from 'expo-router';
import { TriangleAlert } from 'lucide-react-native';
import React from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BrandName } from '@/components/BrandName';
import { QtyStepper } from '@/components/commerce/QtyStepper';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { Skeleton, StateView } from '@/components/ui/StateView';
import { useMartAdd } from '@/components/commerce/ProductCard';
import { TotalsCard } from '@/components/commerce/TotalsCard';
import { useCartTotals } from '@/hooks/useCartTotals';
import { formatMoney } from '@/lib/format';
import { MODULES } from '@/lib/modules';
import { useApp } from '@/state/AppContext';
import { foodUnitPrice, useCart, type FoodLine } from '@/state/CartContext';
import { useSession } from '@/state/SessionContext';
import { colors, radius } from '@/theme';

export default function CartScreen() {
  const { t, lang } = useApp();
  const { isAuthed } = useSession();
  const { mart, food, foodMode, setFoodMode, setFoodQty } = useCart();
  const change = useMartAdd();
  const { totals, loading } = useCartTotals();
  const empty = !mart.length && !food.length;
  const byRestaurant = food.reduce<Record<string, FoodLine[]>>((acc, l) => { (acc[l.restaurant_id] ||= []).push(l); return acc; }, {});
  const blocked = !!totals?.groups.some((g) => !g.eligible) || !!totals?.martUnavailable.length;
  const money = (n: number) => formatMoney(n, totals?.currency || 'XOF', undefined, lang);

  return (
    <SafeAreaView style={styles.root} testID="cart-screen">
      <ScreenHeader title={t('cart.title')} />
      {empty ? <StateView testID="cart-empty" title={t('cart.empty')} body={t('cart.empty_sub')} /> : (
        <ScrollView contentContainerStyle={{ padding: 18, gap: 16, paddingBottom: 140 }}>
          {mart.length ? (
            <View style={styles.card} testID="cart-mart-section">
              <BrandName code="mart" size={17} />
              {mart.map((l) => (
                <Row key={l.product_id} testID={`cart-mart-line-${l.product_id}`} image={l.product?.image} title={l.product?.name} sub={l.product?.unit}
                  price={formatMoney(l.product.price * l.quantity, l.product.currency, l.product.currency_symbol, lang)}
                  unavailable={totals?.martUnavailable.includes(l.product_id)}
                  right={<QtyStepper size="sm" qty={l.quantity} onChange={(q) => change(l.product, q)} color={MODULES.mart.color} testID={`cart-mart-qty-${l.product_id}`} />} />
              ))}
            </View>
          ) : null}
          {food.length ? (
            <View style={styles.card} testID="cart-food-section">
              <BrandName code="food" size={17} />
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {(['delivery', 'pickup'] as const).map((m) => (
                  <Chip key={m} testID={`cart-food-mode-${m}`} label={t(`mode.${m}`)} on={(foodMode === 'dine_in' ? 'pickup' : foodMode) === m} color={MODULES.food.color} onPress={() => setFoodMode(m)} />
                ))}
              </View>
              {Object.entries(byRestaurant).map(([rid, lines]) => {
                const g = totals?.groups.find((x) => x.restaurant_id === rid);
                return (
                  <View key={rid} style={{ gap: 4 }} testID={`cart-food-group-${rid}`}>
                    <AppText weight="bold" size={15} style={{ marginTop: 6 }}>{lines[0].restaurant_name}</AppText>
                    {g && !g.eligible ? (
                      <View style={styles.warn} testID={`cart-food-not-eligible-${rid}`}><TriangleAlert color="#FCC44C" size={16} /><AppText size={12} color="#FCC44C" style={{ flex: 1 }}>{t(foodMode === 'delivery' ? 'cart.not_deliverable' : 'cart.no_pickup')}</AppText></View>
                    ) : null}
                    {lines.map((l) => (
                      <Row key={l.key} testID={`cart-food-line-${l.item_id}`} image={l.image} title={l.name}
                        sub={[l.variant?.name, ...l.addons.map((a) => a.name), l.notes].filter(Boolean).join(' · ')}
                        unavailable={g?.unavailable_item_ids.includes(l.item_id)}
                        price={formatMoney(foodUnitPrice(l) * l.quantity, l.currency, undefined, lang)}
                        right={<QtyStepper size="sm" qty={l.quantity} onChange={(q) => setFoodQty(l.key, q)} color={MODULES.food.color} testID={`cart-food-qty-${l.item_id}`} />} />
                    ))}
                  </View>
                );
              })}
            </View>
          ) : null}
          {loading && !totals ? <Skeleton h={140} /> : totals ? <TotalsCard totals={totals} money={money} /> : null}
        </ScrollView>
      )}
      {!empty ? (
        <View style={styles.footer}>
          <Button testID="cart-checkout" color={colors.accent} disabled={blocked || !totals}
            label={isAuthed ? `${t('cart.checkout')}${totals ? ` · ${money(totals.total)}` : ''}` : t('cart.login_to_checkout')}
            onPress={() => router.push(isAuthed ? '/checkout' : '/login?redirect=/checkout')} />
        </View>
      ) : null}
    </SafeAreaView>
  );
}

function Row({ image, title, sub, price, right, unavailable, testID }: { image?: string; title?: string; sub?: string; price: string; right: React.ReactNode; unavailable?: boolean; testID: string }) {
  const { t } = useApp();
  return (
    <View style={[styles.row, unavailable && { opacity: 0.5 }]} testID={testID}>
      <View style={styles.thumb}>{image ? <Image source={image} style={StyleSheet.absoluteFill} contentFit="cover" /> : null}</View>
      <View style={{ flex: 1, gap: 2 }}>
        <AppText weight="semibold" size={14} numberOfLines={2}>{title}</AppText>
        {sub ? <AppText size={12} color={colors.textMuted} numberOfLines={2}>{sub}</AppText> : null}
        {unavailable ? <AppText weight="bold" size={11} color={colors.danger}>{t('cart.unavailable')}</AppText> : <AppText weight="bold" size={14}>{price}</AppText>}
      </View>
      {right}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  card: { padding: 16, gap: 10, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 6 },
  thumb: { width: 56, height: 56, borderRadius: 12, overflow: 'hidden', backgroundColor: colors.surface2 },
  warn: { flexDirection: 'row', gap: 8, alignItems: 'center', padding: 10, borderRadius: 10, backgroundColor: 'rgba(252,196,76,0.1)' },
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: 16, paddingBottom: 28, backgroundColor: '#0B0B0D', borderTopWidth: 1, borderTopColor: colors.border },
});
