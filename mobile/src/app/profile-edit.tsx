import * as ImagePicker from 'expo-image-picker';
import { Redirect, router } from 'expo-router';
import { Camera } from 'lucide-react-native';
import React, { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar } from '@/components/profile/Avatar';
import { PhoneChange } from '@/components/profile/PhoneChange';
import { PhotoSheet } from '@/components/profile/PhotoSheet';
import { AppText } from '@/components/ui/AppText';
import { Button, Touchable } from '@/components/ui/Button';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { api, apiUpload } from '@/lib/api';
import { notify } from '@/lib/notify';
import { useApp } from '@/state/AppContext';
import { useSession, type Customer } from '@/state/SessionContext';
import { accentText, colors, fonts, radius, themed } from '@/theme';

const EMAIL = /^[^@\s]+@[^@\s]+\.[A-Za-z]{2,}$/;

async function buildForm(a: ImagePicker.ImagePickerAsset) {
  const form = new FormData();
  const type = a.mimeType || 'image/jpeg';
  if (Platform.OS === 'web') form.append('file', (a as any).file || (await (await fetch(a.uri)).blob()), a.fileName || 'photo.jpg');
  else form.append('file', { uri: a.uri, name: a.fileName || `photo.${type.split('/')[1] || 'jpg'}`, type } as any);
  return form;
}

export default function EditProfile() {
  const { t } = useApp();
  const { customer, isAuthed, updateCustomer } = useSession();
  const [name, setName] = useState(customer?.name || '');
  const [email, setEmail] = useState(customer?.email || '');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [phoneOpen, setPhoneOpen] = useState(false);
  const [err, setErr] = useState<{ name?: string; email?: string; form?: string }>({});
  const accent = colors.accent;
  if (!isAuthed) return <Redirect href="/login?redirect=/profile-edit" />;

  const dirty = name.trim() !== (customer?.name || '') || email.trim().toLowerCase() !== (customer?.email || '').toLowerCase();

  const pick = async (src: 'camera' | 'library') => {
    const perm = src === 'camera' ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { notify(t('profile.photo_denied')); return; }
    const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.7 };
    const res = src === 'camera' ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
    if (res.canceled || !res.assets?.[0]) return;
    setUploading(true);
    try { updateCustomer(await apiUpload<Customer>('/customers/me/photo', await buildForm(res.assets[0]))); notify(t('profile.photo_updated')); }
    catch (e: any) { notify(e?.status === 0 ? t('common.network_error') : e?.message); } finally { setUploading(false); }
  };
  const removePhoto = async () => {
    setUploading(true);
    try { updateCustomer(await api<Customer>('/customers/me/photo', { method: 'DELETE' })); } catch (e: any) { notify(e?.message || t('common.network_error')); } finally { setUploading(false); }
  };

  const save = async () => {
    const n = name.trim().replace(/\s+/g, ' '); const em = email.trim().toLowerCase();
    const next = { name: n.length < 1 || n.length > 80 ? t('profile.invalid_name') : undefined, email: em && !EMAIL.test(em) ? t('profile.invalid_email') : undefined };
    setErr(next);
    if (next.name || next.email) return;
    setSaving(true);
    try {
      updateCustomer(await api<Customer>('/customers/me', { method: 'PATCH', body: { name: n, email: em } }));
      notify(t('profile.saved'));
      router.back();
    } catch (e: any) {
      if (e?.status === 409) setErr({ email: t('profile.email_taken') });
      else if (e?.status === 422 && /email/i.test(e?.message || '')) setErr({ email: t('profile.invalid_email') });
      else if (e?.status === 422 && /name/i.test(e?.message || '')) setErr({ name: t('profile.invalid_name') });
      else setErr({ form: e?.status === 0 ? t('common.network_error') : e?.message });
    } finally { setSaving(false); }
  };

  return (
    <SafeAreaView style={styles.root} testID="profile-edit-screen">
      <ScreenHeader title={t('profile.edit')} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          <Touchable testID="profile-edit-photo" onPress={() => setSheet(true)} disabled={uploading} style={styles.photo} scale={0.97}>
            <Avatar uri={customer?.picture} name={customer?.name} size={104} testID="profile-edit-avatar" />
            <View style={[styles.cam, { backgroundColor: accent }]}>{uploading ? <ActivityIndicator color="#000" size="small" /> : <Camera color="#000" size={16} />}</View>
          </Touchable>
          <Field label={t('profile.name')} testID="profile-edit-name" value={name} onValue={(v) => { setName(v); setErr({}); }} placeholder={t('profile.name_ph')} error={err.name} autoCapitalize="words" maxLength={80} />
          <Field label={t('profile.email')} testID="profile-edit-email" value={email} onValue={(v) => { setEmail(v); setErr({}); }} placeholder={t('profile.email_ph')} error={err.email}
            keyboardType="email-address" autoCapitalize="none" autoCorrect={false} />
          <View style={{ gap: 6 }}>
            <AppText size={13} color={colors.textMuted}>{t('profile.phone')}</AppText>
            <View style={[styles.input, styles.phoneRow]}>
              <AppText size={15} weight="medium" style={{ flex: 1 }} testID="profile-edit-phone">{customer?.phone || '—'}</AppText>
              {!phoneOpen ? <Touchable testID="profile-edit-change-phone" onPress={() => setPhoneOpen(true)} hitSlop={8}>
                <AppText size={14} weight="semibold" color={accentText(accent)}>{t('profile.change_phone')}</AppText></Touchable> : null}
            </View>
          </View>
          {phoneOpen ? <PhoneChange color={accent} onDone={() => setPhoneOpen(false)} /> : null}
          {err.form ? <AppText size={13} color={colors.danger} testID="profile-edit-error">{err.form}</AppText> : null}
        </ScrollView>
        <View style={styles.footer}>
          <Button testID="profile-edit-save" label={t('profile.save')} color={accent} loading={saving} disabled={!dirty} onPress={save} />
        </View>
      </KeyboardAvoidingView>
      <PhotoSheet open={sheet} hasPhoto={!!customer?.picture} onClose={() => setSheet(false)} onPick={pick} onRemove={removePhoto} />
    </SafeAreaView>
  );
}

function Field({ label, value, onValue, error, testID, ...rest }: { label: string; value: string; onValue: (v: string) => void; error?: string; testID: string } & Omit<React.ComponentProps<typeof TextInput>, 'onChange'>) {
  return (
    <View style={{ gap: 6 }}>
      <AppText size={13} color={colors.textMuted}>{label}</AppText>
      <TextInput testID={testID} value={value} onChangeText={onValue} placeholderTextColor={colors.textDim} style={[styles.input, error ? { borderColor: colors.danger } : null]} {...rest} />
      {error ? <AppText size={12} color={colors.danger} testID={`${testID}-error`}>{error}</AppText> : null}
    </View>
  );
}

const styles = themed(() => StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  body: { padding: 18, gap: 16, paddingBottom: 40 },
  photo: { alignSelf: 'center', marginVertical: 8 },
  cam: { position: 'absolute', right: 2, bottom: 2, width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: colors.bg },
  input: { height: 52, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, paddingHorizontal: 14, color: colors.text, fontFamily: fonts.medium, fontSize: 15, outlineStyle: 'none' } as any,
  phoneRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  footer: { padding: 16, paddingBottom: 24, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.tabBar },
}));
