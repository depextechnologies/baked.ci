import Constants from 'expo-constants';
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { Bell, ChevronRight, Heart, ShoppingBag, CircleHelp, Globe, LogOut, MapPin, Moon, Pencil, ShieldCheck, UserPen, Wallet } from 'lucide-react-native';
import React from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { LangToggle } from '@/components/LangToggle';
import { Avatar } from '@/components/profile/Avatar';
import { AppText } from '@/components/ui/AppText';
import { Button, Touchable } from '@/components/ui/Button';
import { WEB_ORIGIN } from '@/lib/config';
import { useApp } from '@/state/AppContext';
import { useSession } from '@/state/SessionContext';
import { useThemeMode } from '@/state/ThemeContext';
import type { TKey } from '@/lib/i18n';
import { colors, radius, themed } from '@/theme';

type Item = { id: string; icon: any; label: string; value?: React.ReactNode; onPress?: () => void; auth?: boolean };

export default function Profile() {
  const { t } = useApp();
  const { mode } = useThemeMode();
  const { customer, isAuthed, signOut } = useSession();
  const gate = (p: string) => router.push((isAuthed ? p : `/login?redirect=${p}`) as any);

  const items: Item[] = [
    ...(isAuthed ? [{ id: 'edit', icon: UserPen, label: t('profile.edit'), onPress: () => router.push('/profile-edit' as any) }] : []),
    { id: 'addresses', icon: MapPin, label: t('profile.addresses'), onPress: () => router.push('/addresses' as any) },
    { id: 'wallet', icon: Wallet, label: t('profile.wallet'), onPress: () => gate('/wallet') },
    { id: 'favourites', icon: Heart, label: t('food.favourites'), onPress: () => gate('/food/favourites') },
    { id: 'cart', icon: ShoppingBag, label: t('cart.title'), onPress: () => router.push('/cart') },
    { id: 'notifications', icon: Bell, label: t('profile.notifications'), onPress: () => gate('/notifications') },
    { id: 'language', icon: Globe, label: t('profile.language'), value: <LangToggle /> },
    { id: 'appearance', icon: Moon, label: t('profile.appearance'), value: <View style={styles.valueRow}><AppText size={14} color={colors.textMuted} testID="profile-appearance-value">{t(`theme.${mode}` as TKey)}</AppText><ChevronRight color={colors.textMuted} size={18} /></View>, onPress: () => router.push('/appearance') },
    { id: 'help', icon: CircleHelp, label: t('profile.help'), onPress: () => WebBrowser.openBrowserAsync(`${WEB_ORIGIN}/profile/help`) },
    { id: 'privacy', icon: ShieldCheck, label: t('profile.privacy'), onPress: () => WebBrowser.openBrowserAsync(`${WEB_ORIGIN}/privacy`) },
  ];

  return (
    <SafeAreaView edges={['top']} style={styles.root} testID="profile-screen">
      <ScrollView contentContainerStyle={{ paddingBottom: 30 }}>
        <AppText weight="black" size={28} style={styles.title}>{t('profile.title')}</AppText>
        <Touchable style={styles.account} testID="profile-account" disabled={!isAuthed} onPress={() => router.push('/profile-edit' as any)} scale={0.99}>
          <Avatar uri={isAuthed ? customer?.picture : null} name={isAuthed ? customer?.name : null} testID="profile-avatar" />
          <View style={{ flex: 1 }}>
            <AppText weight="bold" size={18} testID="profile-name">{isAuthed ? customer?.name || customer?.phone || '—' : t('profile.guest')}</AppText>
            <AppText size={13} color={colors.textMuted} testID="profile-contact">{isAuthed ? (customer?.name ? customer?.phone || customer?.email : customer?.phone ? customer?.email : null) : t('profile.guest_sub')}</AppText>
            {isAuthed && customer?.name && customer?.phone && customer?.email ? <AppText size={12} color={colors.textMuted} numberOfLines={1} testID="profile-email">{customer.email}</AppText> : null}
          </View>
          {isAuthed ? <View style={styles.editBadge}><Pencil color={colors.text} size={15} /></View> : null}
        </Touchable>
        {!isAuthed ? (
          <View style={{ paddingHorizontal: 18, marginBottom: 14 }}>
            <Button testID="profile-login" label={t('common.login')} color={colors.accent} onPress={() => router.push('/login?redirect=/profile')} />
          </View>
        ) : null}
        <View style={styles.list}>
          {items.map((it, i) => (
            <Touchable key={it.id} testID={`profile-item-${it.id}`} disabled={!it.onPress} onPress={it.onPress} scale={0.99}
              style={[styles.item, i > 0 && styles.divider]}>
              <it.icon color={colors.text} size={20} />
              <AppText weight="medium" size={15} style={{ flex: 1 }}>{it.label}</AppText>
              {it.value ?? <ChevronRight color={colors.textMuted} size={18} />}
            </Touchable>
          ))}
        </View>
        {isAuthed ? (
          <Touchable testID="profile-logout" onPress={signOut} style={[styles.list, styles.item, { marginTop: 14 }]}>
            <LogOut color={colors.danger} size={20} />
            <AppText weight="semibold" size={15} color={colors.danger}>{t('profile.logout')}</AppText>
          </Touchable>
        ) : null}
        <AppText size={12} color={colors.textDim} align="center" style={{ marginTop: 20 }}>{t('profile.version', { v: Constants.expoConfig?.version || '1.0.0' })}</AppText>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = themed(() => StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  title: { paddingHorizontal: 18, paddingTop: 8, paddingBottom: 16, letterSpacing: -0.6 },
  account: { flexDirection: 'row', alignItems: 'center', gap: 14, marginHorizontal: 18, marginBottom: 14, padding: 16, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  editBadge: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' },
  list: { marginHorizontal: 18, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  item: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, minHeight: 58 },
  valueRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  divider: { borderTopWidth: 1, borderTopColor: colors.borderSoft },
}));
