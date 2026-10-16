import { router, useLocalSearchParams } from 'expo-router';
import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { LangToggle } from '@/components/LangToggle';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { requestOtp } from '@/lib/auth';
import { useApp } from '@/state/AppContext';
import { colors, fonts, radius } from '@/theme';

export default function Login() {
  const { redirect } = useLocalSearchParams<{ redirect?: string }>();
  const { t, country } = useApp();
  const cc = country?.phone_code || '+225';
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const digits = phone.replace(/\D/g, '');

  const submit = async () => {
    if (digits.length < 8) { setErr(t('login.invalid_phone')); return; }
    setBusy(true); setErr(null);
    try {
      const r = await requestOtp(cc, digits);
      router.push({ pathname: '/otp', params: { challenge: r.challenge_id, masked: r.masked_phone, dev: r.dev_code || '', cc, phone: digits, redirect: redirect || '/' } });
    } catch (e: any) {
      setErr(e?.status === 0 ? t('common.network_error') : e?.message);
    } finally { setBusy(false); }
  };

  return (
    <SafeAreaView style={styles.root} testID="login-screen">
      <ScreenHeader title="" right={<LangToggle />} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.body}>
        <AppText weight="black" size={28} style={{ letterSpacing: -0.6 }}>{t('login.title')}</AppText>
        <AppText size={15} color={colors.textMuted} style={{ marginTop: 8, marginBottom: 28 }}>{t('login.body')}</AppText>
        <View style={[styles.field, err ? { borderColor: colors.danger } : null]}>
          <View style={styles.cc}><AppText weight="bold" size={16} testID="login-country-code">{country ? `${(country as any).flag || ''} ${cc}` : cc}</AppText></View>
          <TextInput testID="login-phone-input" value={phone} onChangeText={(v) => { setPhone(v); setErr(null); }} placeholder={t('login.phone_ph')}
            placeholderTextColor={colors.textDim} keyboardType="phone-pad" autoFocus maxLength={15} style={styles.input}
            onSubmitEditing={submit} returnKeyType="done" />
        </View>
        {err ? <AppText testID="login-error" size={13} color={colors.danger} style={{ marginTop: 10 }}>{err}</AppText> : null}
        <View style={{ flex: 1 }} />
        <Button testID="login-submit" label={t('login.send')} loading={busy} disabled={digits.length < 8} onPress={submit} color={colors.accent} />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  body: { flex: 1, paddingHorizontal: 24, paddingTop: 12, paddingBottom: 16 },
  field: { flexDirection: 'row', alignItems: 'center', height: 60, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, overflow: 'hidden' },
  cc: { paddingHorizontal: 16, height: '100%', justifyContent: 'center', borderRightWidth: 1, borderRightColor: colors.border },
  input: { flex: 1, minWidth: 0, height: '100%', paddingHorizontal: 16, color: colors.text, fontFamily: fonts.semibold, fontSize: 18, letterSpacing: 1, outlineStyle: 'none' } as any,
});
