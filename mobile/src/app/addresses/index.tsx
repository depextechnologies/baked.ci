import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Briefcase, Check, Home, MapPin, Pencil, Plus, Trash2 } from 'lucide-react-native';
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText } from '@/components/ui/AppText';
import { Button, Touchable } from '@/components/ui/Button';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { deleteAddress, listAddresses, setCheckoutAddressId, toPicked, updateAddress, type SavedAddress } from '@/lib/addressBook';
import { confirmAsk, notify } from '@/lib/notify';
import { useApp } from '@/state/AppContext';
import { useSession } from '@/state/SessionContext';
import { accentText, colors, radius, themed } from '@/theme';

const iconFor = (l?: string | null) => (/home|domicile/i.test(l || '') ? Home : /office|bureau/i.test(l || '') ? Briefcase : MapPin);

export default function Addresses() {
  const { t, setAddress } = useApp();
  const { isAuthed } = useSession();
  const { select } = useLocalSearchParams<{ select?: string }>();
  const [items, setItems] = useState<SavedAddress[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => { if (isAuthed) listAddresses().then(setItems).catch(() => setItems([])); }, [isAuthed]);
  useFocusEffect(load);

  if (!isAuthed) {
    return (
      <SafeAreaView style={styles.root} testID="addresses-screen">
        <ScreenHeader title={t('ab.title')} />
        <View style={styles.empty}><AppText color={colors.textMuted} align="center">{t('ab.login')}</AppText>
          <Button testID="addresses-login" label={t('cart.login_to_checkout')} onPress={() => router.push('/login?redirect=/addresses')} /></View>
      </SafeAreaView>
    );
  }

  const choose = (a: SavedAddress) => {
    if (!select) return;
    setCheckoutAddressId(a.id);
    setAddress(toPicked(a));
    router.back();
  };
  const makeDefault = async (a: SavedAddress) => {
    setBusy(a.id);
    try { await updateAddress(a.id, { ...a, is_default: true }); load(); } catch { notify(t('ab.save_failed')); }
    setBusy(null);
  };
  const remove = async (a: SavedAddress) => {
    if (!(await confirmAsk(t('ab.delete_q'), t('ab.delete'), t('common.cancel')))) return;
    setBusy(a.id);
    try { await deleteAddress(a.id); load(); } catch { notify(t('ab.save_failed')); }
    setBusy(null);
  };

  return (
    <SafeAreaView style={styles.root} testID="addresses-screen">
      <ScreenHeader title={select ? t('ab.choose') : t('ab.title')} />
      <ScrollView contentContainerStyle={styles.list}>
        {items === null ? <ActivityIndicator color={colors.accent} style={{ marginTop: 40 }} /> : null}
        {items?.length === 0 ? (
          <View style={styles.empty} testID="addresses-empty">
            <MapPin color={colors.textMuted} size={36} />
            <AppText weight="bold" size={17}>{t('ab.empty')}</AppText>
            <AppText color={colors.textMuted} align="center">{t('ab.empty_sub')}</AppText>
          </View>
        ) : null}
        {items?.map((a) => {
          const Icon = iconFor(a.label);
          return (
            <Touchable key={a.id} testID={`address-item-${a.id}`} onPress={() => choose(a)} disabled={!select} scale={0.99} style={[styles.card, a.is_default && styles.cardOn]}>
              <View style={styles.row}>
                <View style={styles.icon}><Icon color={colors.text} size={18} /></View>
                <View style={{ flex: 1 }}>
                  <View style={styles.row}>
                    <AppText weight="bold" size={15}>{a.label || t('ab.other')}</AppText>
                    {a.is_default ? <View style={styles.badge} testID={`address-default-${a.id}`}><AppText size={11} weight="bold" color="#000">{t('ab.default')}</AppText></View> : null}
                  </View>
                  <AppText size={13} color={colors.textMuted} numberOfLines={2}>{[a.line2, a.line1, a.region, a.city].filter(Boolean).join(', ')}</AppText>
                  {a.recipient_name || a.recipient_phone ? <AppText size={12} color={colors.textDim}>{[a.recipient_name, a.recipient_phone].filter(Boolean).join(' · ')}</AppText> : null}
                </View>
                {select ? <Check color={colors.accent} size={18} /> : null}
              </View>
              <View style={styles.actions}>
                {!a.is_default ? <Touchable testID={`address-set-default-${a.id}`} onPress={() => makeDefault(a)} style={styles.act}><AppText size={13} color={accentText(colors.accent)} weight="semibold">{t('ab.set_default')}</AppText></Touchable> : <View style={{ flex: 1 }} />}
                {busy === a.id ? <ActivityIndicator color={colors.accent} /> : null}
                <Touchable testID={`address-edit-${a.id}`} onPress={() => router.push(`/addresses/edit?id=${a.id}` as any)} style={styles.iconBtn} hitSlop={6}><Pencil color={colors.text} size={16} /></Touchable>
                <Touchable testID={`address-delete-${a.id}`} onPress={() => remove(a)} style={styles.iconBtn} hitSlop={6}><Trash2 color={colors.danger} size={16} /></Touchable>
              </View>
            </Touchable>
          );
        })}
      </ScrollView>
      <View style={styles.footer}>
        <Button testID="addresses-add" label={t('ab.add')} icon={<Plus color={colors.bg} size={18} />} onPress={() => router.push('/addresses/edit' as any)} />
      </View>
    </SafeAreaView>
  );
}

const styles = themed(() => StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  list: { padding: 18, gap: 12, paddingBottom: 120 },
  empty: { alignItems: 'center', gap: 10, paddingVertical: 48, paddingHorizontal: 24 },
  card: { borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, padding: 14, gap: 10 },
  cardOn: { borderColor: colors.accent },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  icon: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' },
  badge: { backgroundColor: colors.accent, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 1 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 8, borderTopWidth: 1, borderTopColor: colors.borderSoft, paddingTop: 10 },
  act: { flex: 1 },
  iconBtn: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface2 },
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: 18, paddingBottom: 28, backgroundColor: colors.tabBar, borderTopWidth: 1, borderTopColor: colors.border },
}));
