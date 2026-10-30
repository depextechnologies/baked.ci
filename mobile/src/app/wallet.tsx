import { Redirect } from 'expo-router';
import { Gift } from 'lucide-react-native';
import React from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText } from '@/components/ui/AppText';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { ErrorView, Skeleton, StateView } from '@/components/ui/StateView';
import { useFetch } from '@/hooks/useFetch';
import type { WalletInfo } from '@/hooks/useAccountSummary';
import { formatDate, formatMoney } from '@/lib/format';
import { useApp } from '@/state/AppContext';
import { useSession } from '@/state/SessionContext';
import { colors, radius, themed } from '@/theme';

export default function WalletScreen() {
  const { t, lang } = useApp();
  const { isAuthed } = useSession();
  const { data, loading, error, reload } = useFetch<WalletInfo>(isAuthed ? '/customers/me/wallet' : null);
  const rewards = useFetch<{ points: number; worth: number; currency_symbol: string }>(isAuthed ? '/customers/me/rewards' : null);
  if (!isAuthed) return <Redirect href="/login?redirect=/wallet" />;

  return (
    <SafeAreaView style={styles.root} testID="wallet-screen">
      <ScreenHeader title={t('wallet.title')} />
      <ScrollView contentContainerStyle={{ padding: 18, gap: 14 }}>
        {error ? <ErrorView onRetry={reload} /> : loading || !data ? <Skeleton h={130} r={radius.lg} /> : (
          <View style={styles.card} testID="wallet-balance-card">
            <AppText size={13} color={colors.textMuted}>{t('wallet.balance')}</AppText>
            <AppText weight="black" size={34} testID="wallet-balance">{formatMoney(data.balance, data.currency, data.currency_symbol, lang)}</AppText>
            <AppText size={12} color={colors.textDim}>{t('wallet.inactive')}</AppText>
          </View>
        )}
        {rewards.data ? (
          <View style={[styles.card, styles.rowCard]} testID="wallet-rewards">
            <Gift color={colors.accent} size={22} />
            <AppText weight="bold" size={15} style={{ flex: 1 }}>{t('home.rewards')}</AppText>
            <AppText weight="bold" size={15}>{t('home.points', { n: rewards.data.points })}</AppText>
          </View>
        ) : null}
        <AppText weight="bold" size={17} style={{ marginTop: 6 }}>{t('wallet.history')}</AppText>
        {data && data.transactions.length === 0 ? <StateView title={t('wallet.empty')} /> : null}
        {data?.transactions.map((tx: any) => (
          <View key={tx.id} style={[styles.card, styles.rowCard]}>
            <View style={{ flex: 1 }}>
              <AppText weight="semibold" size={14}>{tx.label}</AppText>
              <AppText size={12} color={colors.textMuted}>#{tx.reference} · {formatDate(tx.at, lang)}</AppText>
            </View>
            <AppText weight="bold" size={14}>{formatMoney(tx.amount, tx.currency, undefined, lang)}</AppText>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = themed(() => StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  card: { padding: 18, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, gap: 6 },
  rowCard: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14 },
}));
