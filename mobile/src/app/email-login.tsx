import { router, useLocalSearchParams } from 'expo-router';
import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { A, AuthButton, AuthHeading, AuthInput, AuthShell, FooterLink, authText } from '@/components/auth/AuthUI';
import { useApp } from '@/state/AppContext';

const EMAIL = /^[^@\s]+@[^@\s]+\.[A-Za-z]{2,}$/;

export default function EmailLogin() {
  const { redirect } = useLocalSearchParams<{ redirect?: string }>();
  const { t } = useApp();
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [err, setErr] = useState<{ email?: string; pw?: string }>({});
  const [note, setNote] = useState<string | null>(null);

  // Phase 1 (UI review): validation only — the secure email/password backend is wired after design approval.
  const submit = () => {
    const e = { email: !email.trim() ? t('auth.req') : !EMAIL.test(email.trim()) ? t('auth.bad_email') : undefined, pw: !pw ? t('auth.req') : undefined };
    setErr(e);
    setNote(e.email || e.pw ? null : t('auth.pending'));
  };

  return (
    <AuthShell testID="email-login-screen">
      <AuthHeading line1={t('login.title')} line2={t('login.your_world')} sub={t('auth.email_title')} />
      <View style={{ gap: 16 }}>
        <AuthInput testID="email-login-email" label={t('auth.email')} placeholder={t('auth.email_ph')} value={email} onChangeText={(v) => { setEmail(v); setErr({}); }}
          error={err.email} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} autoComplete="email" textContentType="emailAddress" />
        <AuthInput testID="email-login-password" label={t('auth.password')} placeholder={t('auth.password_ph')} value={pw} onChangeText={(v) => { setPw(v); setErr({}); }}
          error={err.pw} secure autoCapitalize="none" autoComplete="current-password" textContentType="password" />
        <Pressable testID="email-login-forgot" onPress={() => setNote(t('auth.pending'))} style={{ alignSelf: 'flex-end' }} hitSlop={8}>
          <Text style={authText.link}>{t('auth.forgot')}</Text>
        </Pressable>
        <AuthButton testID="email-login-submit" variant="primary" label={t('auth.login')} onPress={submit} />
        {note ? <Text style={[authText.muted, { color: A.blue, textAlign: 'center' }]} testID="email-login-note">{note}</Text> : null}
      </View>
      <FooterLink testID="email-login-create" text={t('login.no_account')} link={t('login.create')}
        onPress={() => router.replace((redirect ? `/register?redirect=${encodeURIComponent(redirect)}` : '/register') as any)} />
    </AuthShell>
  );
}
