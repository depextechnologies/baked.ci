import { router } from 'expo-router';
import { Bell, Wallet } from 'lucide-react-native';
import React from 'react';
import { StyleSheet, View } from 'react-native';

import { formatMoney } from '@/lib/format';
import type { WalletInfo } from '@/hooks/useAccountSummary';
import { useApp } from '@/state/AppContext';
import { useSession } from '@/state/SessionContext';
import { colors, radius } from '@/theme';
import { Logo } from '../Logo';
import { AppText } from '../ui/AppText';
import { Touchable } from '../ui/Button';

export function BellButton({ unread }: { unread: number }) {
  const { isAuthed } = useSession();
  return (
    <Touchable testID="header-notifications" accessibilityLabel="Notifications" hitSlop={6} style={styles.bell}
      onPress={() => router.push(isAuthed ? '/notifications' : '/login?redirect=/notifications')}>
      <Bell color={colors.text} size={24} />
      {unread > 0 ? (
        <View style={styles.dot} testID="header-notifications-count">
          <AppText weight="bold" size={10} color="#fff">{unread > 9 ? '9+' : unread}</AppText>
        </View>
      ) : null}
    </Touchable>
  );
}

export function MainHeader({ wallet, unread }: { wallet: WalletInfo | null; unread: number }) {
  const { lang } = useApp();
  const { isAuthed } = useSession();
  const label = isAuthed && wallet ? formatMoney(wallet.balance, wallet.currency, wallet.currency_symbol, lang) : null;

  return (
    <View style={styles.row}>
      <Logo height={40} testID="main-logo" />
      <View style={{ flex: 1 }} />
      <BellButton unread={unread} />
      <Touchable testID="header-wallet" style={styles.wallet}
        onPress={() => router.push(isAuthed ? '/wallet' : '/login?redirect=/wallet')}>
        <Wallet color={colors.text} size={20} />
        {label ? <AppText weight="bold" size={15} testID="header-wallet-balance">{label}</AppText> : null}
      </Touchable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 18, paddingTop: 6, paddingBottom: 14 },
  bell: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  dot: { position: 'absolute', top: 4, right: 4, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: colors.danger, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  wallet: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 46, paddingHorizontal: 14, borderRadius: radius.md, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border },
});
