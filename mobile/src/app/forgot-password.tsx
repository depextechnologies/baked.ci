import { router, useLocalSearchParams } from 'expo-router';
import React, { useState } from 'react';
import { Text, View } from 'react-native';

import { AuthButton, AuthHeading, AuthInput, AuthShell, authText } from '@/components/auth/AuthUI';
import { api } from '@/lib/api';
import { authError } from '@/lib/authErrors';
import { finishAuthFlow } from '@/lib/authFlow';
import { useApp } from '@/state/AppContext';
import { useSession, type Customer } from '@/state/SessionContext';

const EMAIL = /^[^@\s]+@[^@\s]+\.[A-Za-z]{2,}$/;

// Two steps: request a reset code (same answer whether or not the account exists), then set a new password.
export default function ForgotPassword() {
  const p = useLocalSearchParams<{ email?: string; redirect?: string }>();
  const { t } = useApp();
  const { signIn } = useSession();
  const [email, setEmail] = useState(p.email || '');
  const [sent, setSent] = useState(false);
  const [dev, setDev] = useState('');
  const [code, setCode] = useState('');
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const send = async () => {
    if (!EMAIL.test(email.trim())) { setErr(t('auth.bad_email')); return; }
    setBusy(true); setErr(null);
    try {
      const r = await api<{ dev_code?: string }>('/auth/password/forgot', { method: 'POST', auth: false, body: { email: email.trim() } });
      setDev(r.dev_code || ''); setSent(true);
    } catch (x) { setErr(authError(x, t)); } finally { setBusy(false); }
  };
  const reset = async () => {
    if (pw.length < 12) { setErr(t('auth.pw_short')); return; }
    setBusy(true); setErr(null);
    try {
      const r = await api<{ access_token: string; customer: Customer }>('/auth/password/reset', { method: 'POST', auth: false, body: { email: email.trim(), code: code.trim(), new_password: pw } });
      await signIn(r.access_token, r.customer);
      finishAuthFlow(p.redirect || undefined);
    } catch (x) { setErr(authError(x, t)); } finally { setBusy(false); }
  };

  return (
    <AuthShell testID="forgot-screen">
      <AuthHeading line1={t('auth.forgot_title')} sub={sent ? t('auth.forgot_sent') : t('auth.forgot_sub')} />
      <View style={{ gap: 16 }}>
        <AuthInput testID="forgot-email" label={t('auth.email')} placeholder={t('auth.email_ph')} value={email} onChangeText={(v) => { setEmail(v); setErr(null); }}
          editable={!sent} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} autoComplete="email" />
        {sent ? (
          <>
            {dev ? <Text style={authText.muted} testID="forgot-dev-code">DEV: {dev}</Text> : null}
            <AuthInput testID="forgot-code" label={t('auth.code')} value={code} onChangeText={(v) => { setCode(v.replace(/\D/g, '')); setErr(null); }} keyboardType="number-pad" maxLength={6} autoComplete="one-time-code" />
            <AuthInput testID="forgot-password" label={t('auth.new_pw')} placeholder={t('auth.pw_hint')} value={pw} onChangeText={(v) => { setPw(v); setErr(null); }} secure autoCapitalize="none" autoComplete="new-password" />
            <AuthButton testID="forgot-reset" variant="primary" loading={busy} disabled={code.length !== 6} label={t('auth.reset')} onPress={reset} />
          </>
        ) : <AuthButton testID="forgot-send" variant="primary" loading={busy} label={t('auth.send_code')} onPress={send} />}
        {err ? <Text style={[authText.err, { textAlign: 'center' }]} testID="forgot-error">{err}</Text> : null}
        <Text style={[authText.link, { textAlign: 'center' }]} onPress={() => router.back()} testID="forgot-back">{t('auth.back')}</Text>
      </View>
    </AuthShell>
  );
}
