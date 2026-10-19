import React from 'react';
import { StyleSheet, View } from 'react-native';

import type { Totals } from '@/hooks/useCartTotals';
import { useApp } from '@/state/AppContext';
import { colors, radius } from '@/theme';
import { AppText } from '../ui/AppText';

export function TotalsCard({ totals, money }: { totals: Totals; money: (n: number) => string }) {
  const { t } = useApp();
  const fee = totals.martFee + totals.foodFee;
  return (
    <View style={styles.card} testID="cart-totals">
      <Line label={t('cart.subtotal')} value={money(totals.martSubtotal + totals.foodSubtotal)} testID="cart-subtotal" />
      <Line label={t('cart.delivery_fee')} value={fee ? money(fee) : t('cart.free')} testID="cart-delivery-fee" />
      <View style={{ height: 1, backgroundColor: colors.border, marginVertical: 4 }} />
      <Line label={t('cart.total')} value={money(totals.total)} bold testID="cart-total" />
    </View>
  );
}

const Line = ({ label, value, bold, testID }: { label: string; value: string; bold?: boolean; testID: string }) => (
  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
    <AppText size={bold ? 17 : 14} weight={bold ? 'black' : 'regular'} color={bold ? colors.text : colors.textMuted}>{label}</AppText>
    <AppText size={bold ? 17 : 14} weight={bold ? 'black' : 'semibold'} testID={testID}>{value}</AppText>
  </View>
);

const styles = StyleSheet.create({
  card: { padding: 16, gap: 10, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
});
