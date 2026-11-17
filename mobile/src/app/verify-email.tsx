import { useLocalSearchParams } from 'expo-router';
import React, { useState } from 'react';
import { Text, View } from 'react-native';

import { AuthButton, AuthHeading, AuthInput, AuthShell, authText } from '@/components/auth/AuthUI';
import { api } from '@/lib/api';
import { authError } from '@/lib/authErrors';
import { finishAuthFlow } from '@/lib/authFlow';
import { notify } from '@/lib/notify';
import { useApp } from '@/state/AppContext';
import { useSession, type Customer } from '@/state/SessionContext';

// After sign-up: confirm the email with its own code. The account stays usable; the email is "pending" until verified.
export default function VerifyEmail() {
  const p = useLocalSearchParams<{ redirect?: string; dev?: string; status?: string }>();
  const { t } = useApp();
  const { customer, updateCustomer } = useSession();
  const [code, setCode] = useState('');
  const [dev, setDev] = useState(p.dev || '');
  const [status, setStatus] = useState(p.status || 'sent');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const done = () => finishAuthFlow(p.redirect || undefined);

  const verify = async () => {
    setBusy(true); setErr(null);
    try {
      updateCustomer(await api<Customer>('/auth/email/verify', { method: 'POST', body: { code: code.trim() } }));
      notify(t('auth.email_verified'));
      done();
    } catch (x) { setErr(authError(x, t)); } finally { setBusy(false); }
  };
  const resend = async () => {
    setErr(null);
    try { const r = await api<any>('/auth/email/send-verification', { method: 'POST' }); setStatus(r.status); setDev(r.dev_code || ''); setCode(''); }
    catch (x) { setErr(authError(x, t)); }
  };

  return (
    <AuthShell testID="verify-email-screen" onBack={done}>
      <AuthHeading line1={t('auth.verify_email_title')} sub={status === 'unavailable' ? t('auth.verify_email_unavailable') : t('auth.verify_email_sub', { e: customer?.email || '' })} />
      <View style={{ gap: 16 }}>
        {dev ? <Text style={authText.muted} testID="verify-email-dev-code">DEV: {dev}</Text> : null}
        <AuthInput testID="verify-email-code" label={t('auth.code')} value={code} onChangeText={(v) => { setCode(v.replace(/\D/g, '')); setErr(null); }} keyboardType="number-pad" maxLength={6} autoComplete="one-time-code" />
        <AuthButton testID="verify-email-submit" variant="primary" loading={busy} disabled={code.length !== 6} label={t('auth.verify')} onPress={verify} />
        {err ? <Text style={[authText.err, { textAlign: 'center' }]} testID="verify-email-error">{err}</Text> : null}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Text style={authText.link} onPress={resend} testID="verify-email-resend">{t('auth.resend')}</Text>
          <Text style={[authText.link, { color: '#A3A3A3' }]} onPress={done} testID="verify-email-later">{t('auth.later')}</Text>
        </View>
      </View>
    </AuthShell>
  );
}
