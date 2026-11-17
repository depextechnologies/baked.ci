import { router, useLocalSearchParams } from 'expo-router';
import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { api } from '@/lib/api';
import { authError } from '@/lib/authErrors';
import { finishAuthFlow } from '@/lib/authFlow';
import { useSession, type Customer } from '@/state/SessionContext';
import { A, AuthButton, AuthHeading, AuthInput, AuthShell, FooterLink, authText } from '@/components/auth/AuthUI';
import { useApp } from '@/state/AppContext';

const EMAIL = /^[^@\s]+@[^@\s]+\.[A-Za-z]{2,}$/;

export default function EmailLogin() {
  const { redirect } = useLocalSearchParams<{ redirect?: string }>();
  const { t, completeOnboarding } = useApp();
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [err, setErr] = useState<{ email?: string; pw?: string }>({});
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { signIn } = useSession();

  const submit = async () => {
    const e = { email: !email.trim() ? t('auth.req') : !EMAIL.test(email.trim()) ? t('auth.bad_email') : undefined, pw: !pw ? t('auth.req') : undefined };
    setErr(e); setNote(null);
    if (e.email || e.pw || busy) return;
    setBusy(true);
    try {
      const r = await api<{ access_token: string; customer: Customer }>('/auth/login/email', { method: 'POST', auth: false, body: { email: email.trim(), password: pw } });
      await signIn(r.access_token, r.customer);
      completeOnboarding();
      finishAuthFlow(redirect);
    } catch (x: any) { setNote(authError(x, t)); } finally { setBusy(false); }
  };

  return (
    <AuthShell testID="email-login-screen">
      <AuthHeading line1={t('login.title')} line2={t('login.your_world')} sub={t('auth.email_title')} />
      <View style={{ gap: 16 }}>
        <AuthInput testID="email-login-email" label={t('auth.email')} placeholder={t('auth.email_ph')} value={email} onChangeText={(v) => { setEmail(v); setErr({}); }}
          error={err.email} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} autoComplete="email" textContentType="emailAddress" />
        <AuthInput testID="email-login-password" label={t('auth.password')} placeholder={t('auth.password_ph')} value={pw} onChangeText={(v) => { setPw(v); setErr({}); }}
          error={err.pw} secure autoCapitalize="none" autoComplete="current-password" textContentType="password" />
        <Pressable testID="email-login-forgot" onPress={() => router.push({ pathname: '/forgot-password', params: { email: email.trim(), redirect: redirect || '' } } as any)} style={{ alignSelf: 'flex-end' }} hitSlop={8}>
          <Text style={authText.link}>{t('auth.forgot')}</Text>
        </Pressable>
        <AuthButton testID="email-login-submit" variant="primary" loading={busy} label={t('auth.login')} onPress={submit} />
        {note ? <Text style={[authText.err, { textAlign: 'center' }]} testID="email-login-error">{note}</Text> : null}
      </View>
      <FooterLink testID="email-login-create" text={t('login.no_account')} link={t('login.create')}
        onPress={() => router.replace((redirect ? `/register?redirect=${encodeURIComponent(redirect)}` : '/register') as any)} />
    </AuthShell>
  );
}
