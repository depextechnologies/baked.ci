import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Check, MapPin } from 'lucide-react-native';
import React, { useCallback, useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText } from '@/components/ui/AppText';
import { Button, Touchable } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { createAddress, listAddresses, takePendingPick, updateAddress, type AddressInput } from '@/lib/addressBook';
import type { TKey } from '@/lib/i18n';
import { notify } from '@/lib/notify';
import { useApp } from '@/state/AppContext';
import { useSession } from '@/state/SessionContext';
import { accentText, colors, fonts, radius, themed } from '@/theme';

type Kind = 'home' | 'office' | 'other';
const LABELS: Record<Kind, { fr: string; en: string }> = { home: { fr: 'Domicile', en: 'Home' }, office: { fr: 'Bureau', en: 'Office' }, other: { fr: 'Autre', en: 'Other' } };
const kindOf = (l?: string | null): Kind => (/^(home|domicile)$/i.test(l || '') ? 'home' : /^(office|bureau)$/i.test(l || '') ? 'office' : l ? 'other' : 'home');

function Field({ label, value, onValue, testID, ...rest }: { label: string; value: string; onValue: (v: string) => void; testID: string } & Omit<React.ComponentProps<typeof TextInput>, "onChange">) {
  return (
    <View style={{ gap: 6 }}>
      <AppText size={13} color={colors.textMuted}>{label}</AppText>
      <TextInput testID={testID} value={value} onChangeText={onValue} placeholderTextColor={colors.textDim} style={styles.input} {...rest} />
    </View>
  );
}

export default function EditAddress() {
  const { t, lang, country } = useApp();
  const { customer } = useSession();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const [f, setF] = useState<AddressInput>({ label: 'Home', line1: '', country: country?.code || 'CI', recipient_name: customer?.name || '', recipient_phone: customer?.phone || '' });
  const [kind, setKind] = useState<Kind>('home');
  const [custom, setCustom] = useState('');
  const [isDefault, setIsDefault] = useState(false);
  const [saving, setSaving] = useState(false);
  const set = (k: keyof AddressInput) => (v: any) => setF((p) => ({ ...p, [k]: v }));

  useEffect(() => {
    if (!id) return;
    listAddresses().then((rows) => {
      const a = rows.find((r) => r.id === id);
      if (!a) return;
      const { id: _i, is_default, ...rest } = a;
      setF(rest); setIsDefault(is_default); const k = kindOf(a.label); setKind(k); if (k === 'other') setCustom(a.label || '');
    }).catch(() => {});
  }, [id]);

  // Location picked on the map / search screen.
  useFocusEffect(useCallback(() => {
    const p = takePendingPick();
    if (p) setF((x) => ({ ...x, line1: p.line1 || x.line1, city: p.city || x.city, latitude: p.latitude, longitude: p.longitude, place_id: p.place_id, formatted_address: p.formatted_address, country: p.country || x.country }));
  }, []));

  const save = async () => {
    if (f.latitude == null || f.longitude == null) { notify(t('ab.need_location')); return; }
    if (!f.line1?.trim()) { notify(t('ab.need_street')); return; }
    const label = kind === 'other' ? (custom.trim() || LABELS.other[lang === 'en' ? 'en' : 'fr']) : LABELS[kind][lang === 'en' ? 'en' : 'fr'];
    const body = { ...f, label, is_default: isDefault, city: f.city || '' };
    setSaving(true);
    try {
      if (id) await updateAddress(id, body); else await createAddress(body);
      notify(t('ab.saved'));
      router.back();
    } catch { notify(t('ab.save_failed')); }
    setSaving(false);
  };

  return (
    <SafeAreaView style={styles.root} testID="address-edit-screen">
      <ScreenHeader title={id ? t('ab.edit_title') : t('ab.new')} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          <Touchable testID="address-edit-location" onPress={() => router.push('/address?book=1')} style={styles.loc}>
            <MapPin color={colors.accent} size={20} />
            <View style={{ flex: 1 }}>
              <AppText weight="semibold">{t('ab.location')}</AppText>
              <AppText size={13} color={colors.textMuted} numberOfLines={2} testID="address-edit-location-text">{f.latitude != null ? (f.formatted_address || f.line1) : t('ab.pick')}</AppText>
            </View>
            <AppText size={13} color={accentText(colors.accent)} weight="semibold">{f.latitude != null ? t('ab.change') : ''}</AppText>
          </Touchable>
          <AppText size={13} color={colors.textMuted}>{t('ab.label')}</AppText>
          <View style={styles.chips}>
            {(['home', 'office', 'other'] as Kind[]).map((k) => <Chip key={k} testID={`address-label-${k}`} label={t(`ab.${k}` as TKey)} on={kind === k} color={colors.accent} onPress={() => setKind(k)} />)}
          </View>
          {kind === 'other' ? <Field testID="address-custom-label" label={t('ab.custom')} value={custom} onValue={setCustom} /> : null}
          <Field testID="address-recipient-name" label={t('ab.recipient')} value={f.recipient_name || ''} onValue={set('recipient_name')} />
          <Field testID="address-recipient-phone" label={t('ab.phone')} value={f.recipient_phone || ''} onValue={set('recipient_phone')} keyboardType="phone-pad" />
          <Field testID="address-street" label={t('ab.street')} value={f.line1 || ''} onValue={set('line1')} />
          <Field testID="address-building" label={`${t('ab.building')} ${t('ab.optional')}`} value={f.line2 || ''} onValue={set('line2')} />
          <Field testID="address-landmark" label={`${t('ab.landmark')} ${t('ab.optional')}`} value={f.landmark || ''} onValue={set('landmark')} />
          <Field testID="address-instructions" label={`${t('ab.instructions')} ${t('ab.optional')}`} value={f.instructions || ''} onValue={set('instructions')} multiline />
          <View style={styles.two}>
            <View style={{ flex: 1 }}><Field testID="address-area" label={t('ab.area')} value={f.region || ''} onValue={set('region')} /></View>
            <View style={{ flex: 1 }}><Field testID="address-city" label={t('ab.city')} value={f.city || ''} onValue={set('city')} /></View>
          </View>
          <View style={styles.two}>
            <View style={{ flex: 1 }}><Field testID="address-postal" label={`${t('ab.postal')} ${t('ab.optional')}`} value={f.postal_code || ''} onValue={set('postal_code')} /></View>
            <View style={{ flex: 1 }}><Field testID="address-country" label={t('ab.country')} value={f.country} onValue={() => {}} editable={false} /></View>
          </View>
          <Touchable testID="address-default-toggle" onPress={() => setIsDefault((v) => !v)} style={styles.check}>
            <View style={[styles.box, isDefault && styles.boxOn]}>{isDefault ? <Check color="#000" size={14} strokeWidth={3} /> : null}</View>
            <AppText>{t('ab.make_default')}</AppText>
          </Touchable>
        </ScrollView>
      </KeyboardAvoidingView>
      <View style={styles.footer}><Button testID="address-save" label={t('ab.save')} loading={saving} onPress={save} /></View>
    </SafeAreaView>
  );
}

const styles = themed(() => StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  body: { padding: 18, gap: 14, paddingBottom: 130 },
  loc: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  chips: { flexDirection: 'row', gap: 8 },
  input: { minHeight: 48, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, color: colors.text, paddingHorizontal: 14, fontFamily: fonts.regular, fontSize: 15 },
  two: { flexDirection: 'row', gap: 10 },
  check: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
  box: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  boxOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: 18, paddingBottom: 28, backgroundColor: colors.tabBar, borderTopWidth: 1, borderTopColor: colors.border },
}));
