import { router, useLocalSearchParams } from 'expo-router';
import { ChevronDown, Mail } from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

import { LangToggle } from '@/components/LangToggle';
import { Logo } from '@/components/Logo';
import { AppText } from '@/components/ui/AppText';
import { Button, Touchable } from '@/components/ui/Button';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { requestOtp } from '@/lib/auth';
import { finishAuthFlow } from '@/lib/authFlow';
import { consumeWebCallback, startGoogle } from '@/lib/googleAuth';
import { notify } from '@/lib/notify';
import { useApp } from '@/state/AppContext';
import { useSession } from '@/state/SessionContext';
import { colors, fonts, radius } from '@/theme';

const RED = '#FF4C52';
// Same list as the website PhoneLoginDialog.
const CODES = [['CI', '+225'], ['GB', '+44'], ['IN', '+91'], ['SN', '+221'], ['GH', '+233'], ['NG', '+234'], ['KE', '+254']];

export default function Login() {
  const { redirect } = useLocalSearchParams<{ redirect?: string }>();
  const { t, country } = useApp();
  const { signIn } = useSession();
  const [cc, setCc] = useState(country?.phone_code || '+225');
  const [open, setOpen] = useState(false);
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [gBusy, setGBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const digits = phone.replace(/\D/g, '');

  useEffect(() => {
    consumeWebCallback().then(async (r) => { if (r) { await signIn(r.out.access_token, r.out.customer); finishAuthFlow(r.redirect); } })
      .catch(() => notify(t('login.google_failed')));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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

  const google = async () => {
    setGBusy(true);
    try {
      const out = await startGoogle(redirect || '/');
      if (out) { await signIn(out.access_token, out.customer); finishAuthFlow(redirect); }
    } catch { notify(t('login.google_failed')); } finally { setGBusy(false); }
  };

  return (
    <SafeAreaView style={styles.root} testID="login-screen">
      <ScreenHeader title="" right={<LangToggle />} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          <View style={{ alignItems: 'center', marginBottom: 22 }}><Logo height={46} /></View>
          <AppText weight="semibold" size={30} align="center" style={{ lineHeight: 36 }} testID="login-title">
            {t('login.title')}{'\n'}<AppText weight="semibold" size={30} color={RED}>{t('login.your_world')}</AppText>
          </AppText>
          <AppText size={14} color={colors.textMuted} align="center" style={{ marginTop: 8 }}>{t('login.body')}</AppText>

          <View style={[styles.field, err ? { borderColor: colors.danger } : null]}>
            <Touchable testID="login-country-code" onPress={() => setOpen((o) => !o)} style={styles.cc}>
              <AppText weight="semibold" size={14}>{CODES.find((c) => c[1] === cc)?.[0] || ''} {cc}</AppText>
              <ChevronDown color={colors.textMuted} size={14} />
            </Touchable>
            <TextInput testID="login-phone-input" value={phone} onChangeText={(v) => { setPhone(v); setErr(null); }} placeholder={t('login.phone_ph')}
              placeholderTextColor={colors.textDim} keyboardType="phone-pad" maxLength={15} style={styles.input} onSubmitEditing={submit} returnKeyType="done" />
          </View>
          {open ? (
            <View style={styles.menu} testID="login-country-menu">
              {CODES.map(([iso, code]) => (
                <Touchable key={code} testID={`login-cc-${iso}`} onPress={() => { setCc(code); setOpen(false); }} style={[styles.menuItem, code === cc && { backgroundColor: colors.surface2 }]}>
                  <AppText size={14} weight={code === cc ? 'bold' : 'regular'}>{iso}  {code}</AppText>
                </Touchable>
              ))}
            </View>
          ) : null}
          {err ? <AppText testID="login-error" size={13} color={colors.danger} style={{ marginTop: 10 }}>{err}</AppText> : null}

          <View style={{ marginTop: 16 }}><Button testID="login-submit" label={t('login.send')} loading={busy} onPress={submit} color={RED} /></View>

          <View style={styles.or}><View style={styles.line} /><AppText size={12} color={colors.textMuted}>{t('login.or')}</AppText><View style={styles.line} /></View>

          <Touchable testID="login-google" onPress={google} disabled={gBusy} style={styles.alt}>
            <Svg width={20} height={20} viewBox="0 0 48 48">
              <Path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
              <Path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
              <Path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
              <Path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
            </Svg>
            <AppText size={15} weight="medium">{t('login.google')}</AppText>
          </Touchable>
          <Touchable testID="login-email" onPress={() => notify(t('login.email_soon'))} style={[styles.alt, { marginTop: 12 }]}>
            <Mail color={colors.text} size={18} /><AppText size={15} weight="medium">{t('login.email')}</AppText>
          </Touchable>

          <View style={styles.create}>
            <AppText size={14} color={colors.textMuted}>{t('login.no_account')} </AppText>
            <Touchable testID="login-create-account" onPress={submit}><AppText size={14} weight="semibold" color={RED}>{t('login.create')} →</AppText></Touchable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  body: { paddingHorizontal: 24, paddingTop: 8, paddingBottom: 32 },
  field: { marginTop: 32, flexDirection: 'row', alignItems: 'center', height: 56, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, overflow: 'hidden' },
  cc: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, height: '100%', borderRightWidth: 1, borderRightColor: colors.border },
  input: { flex: 1, minWidth: 0, height: '100%', paddingHorizontal: 14, color: colors.text, fontFamily: fonts.medium, fontSize: 15, outlineStyle: 'none' } as any,
  menu: { marginTop: 6, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, overflow: 'hidden' },
  menuItem: { paddingHorizontal: 16, paddingVertical: 12 },
  or: { flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 24 },
  line: { flex: 1, height: 1, backgroundColor: colors.border },
  alt: { height: 56, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12 },
  create: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: 24, flexWrap: 'wrap' },
});
