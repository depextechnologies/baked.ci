import { router } from 'expo-router';
import { ChevronRight, Gift, Receipt, Wallet } from 'lucide-react-native';
import React from 'react';
import { StyleSheet, View } from 'react-native';

import { formatMoney } from '@/lib/format';
import type { WalletInfo } from '@/hooks/useAccountSummary';
import { useApp } from '@/state/AppContext';
import { useSession } from '@/state/SessionContext';
import { colors, radius } from '@/theme';
import { AppText } from '../ui/AppText';
import { Touchable } from '../ui/Button';

export function QuickStrip({ wallet, points }: { wallet: WalletInfo | null; points: number | null }) {
  const { t, lang } = useApp();
  const { isAuthed } = useSession();
  const gate = (path: string) => router.push((isAuthed ? path : `/login?redirect=${path}`) as any);

  const items = [
    {
      id: 'wallet', icon: Wallet, title: t('home.wallet'), onPress: () => gate('/wallet'),
      value: isAuthed && wallet ? formatMoney(wallet.balance, wallet.currency, wallet.currency_symbol, lang) : t('common.login'),
    },
    {
      id: 'rewards', icon: Gift, title: t('home.rewards'), onPress: () => gate('/wallet'),
      value: isAuthed && points != null ? t('home.points', { n: points }) : t('common.login'),
    },
    { id: 'activity', icon: Receipt, title: t('home.activity'), value: t('home.activity_sub'), onPress: () => router.navigate('/activity') },
  ];

  return (
    <View style={styles.strip}>
      {items.map((it, i) => (
        <Touchable key={it.id} testID={`quick-${it.id}`} onPress={it.onPress} style={[styles.cell, i > 0 && styles.divider]}>
          <View style={styles.top}>
            <it.icon color={colors.text} size={20} />
            <ChevronRight color={colors.textMuted} size={14} />
          </View>
          <AppText size={11} color={colors.textMuted} numberOfLines={1}>{it.title}</AppText>
          <AppText weight="bold" size={13} numberOfLines={1}>{it.value}</AppText>
        </Touchable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  strip: { flexDirection: 'row', marginHorizontal: 18, marginTop: 14, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  cell: { flex: 1, gap: 2, paddingVertical: 12, paddingHorizontal: 12 },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  divider: { borderLeftWidth: 1, borderLeftColor: colors.border },
});
