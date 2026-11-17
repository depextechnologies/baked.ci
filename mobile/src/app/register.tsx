import { router, useLocalSearchParams } from 'expo-router';
import { Check } from 'lucide-react-native';
import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { A, AuthButton, AuthHeading, AuthInput, AuthShell, FooterLink, PhoneField, authText } from '@/components/auth/AuthUI';
import { useApp } from '@/state/AppContext';

const EMAIL = /^[^@\s]+@[^@\s]+\.[A-Za-z]{2,}$/;
type Errs = Partial<Record<'first' | 'last' | 'phone' | 'email' | 'pw' | 'pw2' | 'terms', string>>;

export default function Register() {
  const { redirect } = useLocalSearchParams<{ redirect?: string }>();
  const { t, country } = useApp();
  const [f, setF] = useState({ first: '', last: '', phone: '', email: '', pw: '', pw2: '' });
  const [cc, setCc] = useState(country?.phone_code || '+225');
  const [terms, setTerms] = useState(false);
  const [err, setErr] = useState<Errs>({});
  const [note, setNote] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (v: string) => { setF((p) => ({ ...p, [k]: v })); setErr((e) => ({ ...e, [k]: undefined })); setNote(null); };

  // Phase 1 (UI review): full client validation; secure registration + phone/email verification is wired after approval.
  const submit = () => {
    const e: Errs = {
      first: f.first.trim() ? undefined : t('auth.req'),
      last: f.last.trim() ? undefined : t('auth.req'),
      phone: f.phone.replace(/\D/g, '').length >= 8 ? undefined : t('login.invalid_phone'),
      email: !f.email.trim() ? t('auth.req') : EMAIL.test(f.email.trim()) ? undefined : t('auth.bad_email'),
      pw: f.pw.length >= 12 ? undefined : t('auth.pw_short'),
      pw2: !f.pw2 ? t('auth.req') : f.pw2 === f.pw ? undefined : t('auth.pw_match'),
      terms: terms ? undefined : t('auth.terms_req'),
    };
    setErr(e);
    setNote(Object.values(e).some(Boolean) ? null : t('auth.pending'));
  };

  return (
    <AuthShell testID="register-screen">
      <AuthHeading line1={t('auth.register_title')} sub={t('auth.register_sub')} />
      <View style={{ gap: 14 }}>
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <View style={{ flex: 1 }}><AuthInput testID="register-first" label={t('auth.first')} value={f.first} onChangeText={set('first')} error={err.first} autoComplete="given-name" textContentType="givenName" /></View>
          <View style={{ flex: 1 }}><AuthInput testID="register-last" label={t('auth.last')} value={f.last} onChangeText={set('last')} error={err.last} autoComplete="family-name" textContentType="familyName" /></View>
        </View>
        <View style={{ gap: 6 }}>
          <Text style={authText.label}>{t('auth.phone')}</Text>
          <PhoneField cc={cc} setCc={setCc} phone={f.phone} setPhone={set('phone')} placeholder={t('login.phone_ph')} error={err.phone} />
        </View>
        <AuthInput testID="register-email" label={t('auth.email')} placeholder={t('auth.email_ph')} value={f.email} onChangeText={set('email')} error={err.email}
          keyboardType="email-address" autoCapitalize="none" autoCorrect={false} autoComplete="email" textContentType="emailAddress" />
        <AuthInput testID="register-password" label={t('auth.create_pw')} placeholder={t('auth.pw_hint')} value={f.pw} onChangeText={set('pw')} error={err.pw}
          secure autoCapitalize="none" autoComplete="new-password" textContentType="newPassword" />
        <AuthInput testID="register-password2" label={t('auth.confirm_pw')} value={f.pw2} onChangeText={set('pw2')} error={err.pw2}
          secure autoCapitalize="none" autoComplete="new-password" textContentType="newPassword" />
        <Pressable testID="register-terms" onPress={() => { setTerms((v) => !v); setErr((e) => ({ ...e, terms: undefined })); }} style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }} accessibilityRole="checkbox" accessibilityState={{ checked: terms }}>
          <View style={{ width: 24, height: 24, borderRadius: 6, borderWidth: 1.5, borderColor: terms ? A.blue : A.border, backgroundColor: terms ? A.blue : A.input, alignItems: 'center', justifyContent: 'center' }}>
            {terms ? <Check color={A.text} size={16} /> : null}
          </View>
          <Text style={[authText.muted, { flex: 1, color: A.text }]}>{t('auth.terms')}</Text>
        </Pressable>
        {err.terms ? <Text style={authText.err} testID="register-terms-error">{err.terms}</Text> : null}
        <AuthButton testID="register-submit" variant="primary" label={t('auth.create')} onPress={submit} />
        {note ? <Text style={[authText.muted, { color: A.blue, textAlign: 'center' }]} testID="register-note">{note}</Text> : null}
      </View>
      <FooterLink testID="register-login" text={t('auth.have')} link={t('auth.login_link')}
        onPress={() => router.replace((redirect ? `/login?redirect=${encodeURIComponent(redirect)}` : '/login') as any)} />
    </AuthShell>
  );
}
