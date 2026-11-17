import { router, useLocalSearchParams } from 'expo-router';
import { Mail, MessageCircle, UserRound } from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';

import { GoogleIcon, WhatsAppIcon } from '@/components/auth/AuthIcons';
import { A, AuthButton, AuthHeading, AuthShell, FooterLink, OrDivider, PhoneField, authText } from '@/components/auth/AuthUI';
import { requestOtp } from '@/lib/auth';
import { finishAuthFlow } from '@/lib/authFlow';
import { consumeWebCallback, startGoogle } from '@/lib/googleAuth';
import { notify } from '@/lib/notify';
import { useApp } from '@/state/AppContext';
import { useSession } from '@/state/SessionContext';

export default function Login() {
  const { redirect } = useLocalSearchParams<{ redirect?: string }>();
  const { t, country } = useApp();
  const { signIn } = useSession();
  const [cc, setCc] = useState(country?.phone_code || '+225');
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [gBusy, setGBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const digits = phone.replace(/\D/g, '');

  useEffect(() => {
    consumeWebCallback().then(async (r) => { if (r) { await signIn(r.out.access_token, r.out.customer); finishAuthFlow(r.redirect); } })
      .catch(() => notify(t('login.google_failed')));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const valid = () => {
    if (digits.length < 8) { setErr(t('login.invalid_phone')); return false; }
    setErr(null); setInfo(null); return true;
  };
  const sms = async () => {
    if (busy || !valid()) return;
    setBusy(true);
    try {
      const r = await requestOtp(cc, digits);
      router.push({ pathname: '/otp', params: { challenge: r.challenge_id, masked: r.masked_phone, dev: r.dev_code || '', cc, phone: digits, channel: 'sms', redirect: redirect || '/' } });
    } catch (e: any) { setErr(e?.status === 0 ? t('common.network_error') : e?.message); } finally { setBusy(false); }
  };
  // WhatsApp delivery needs an approved provider (Twilio Verify) — never fake it; offer SMS instead.
  const whatsapp = () => { if (valid()) setInfo(t('login.whatsapp_off')); };

  const google = async () => {
    setGBusy(true);
    try {
      const out = await startGoogle(redirect || '/');
      if (out) { await signIn(out.access_token, out.customer); finishAuthFlow(redirect); }
    } catch { notify(t('login.google_failed')); } finally { setGBusy(false); }
  };
  const withRedirect = (p: string) => (redirect ? `${p}?redirect=${encodeURIComponent(redirect)}` : p);

  return (
    <AuthShell testID="login-screen">
      <AuthHeading line1={t('login.title')} line2={t('login.your_world')} sub={t('login.body')} />
      <PhoneField cc={cc} setCc={setCc} phone={phone} setPhone={(v) => { setPhone(v); setErr(null); setInfo(null); }} placeholder={t('login.phone_ph')} error={err} />
      <Text style={[authText.label, { marginTop: 20, marginBottom: 12 }]}>{t('login.via')}</Text>
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <AuthButton testID="login-sms" variant="primary" flex loading={busy} label={t('login.sms')} icon={<MessageCircle color={A.text} size={20} />} onPress={sms} />
        <AuthButton testID="login-whatsapp" variant="whatsapp" flex label={t('login.whatsapp')} icon={<WhatsAppIcon size={20} />} onPress={whatsapp} />
      </View>
      {info ? <Text style={[authText.muted, { marginTop: 10, color: A.green }]} testID="login-whatsapp-info">{info}</Text> : null}
      <OrDivider label={t('login.or')} />
      <View style={{ gap: 12 }}>
        <AuthButton testID="login-google" loading={gBusy} label={t('login.google')} icon={<GoogleIcon />} onPress={google} />
        <AuthButton testID="login-email" label={t('login.email')} icon={<Mail color={A.text} size={22} />} onPress={() => router.push(withRedirect('/email-login') as any)} />
        <AuthButton testID="login-guest" label={t('login.guest')} icon={<UserRound color={A.text} size={22} />} onPress={() => router.replace('/')} />
      </View>
      <FooterLink testID="login-create" text={t('login.no_account')} link={t('login.create')} onPress={() => router.push(withRedirect('/register') as any)} />
    </AuthShell>
  );
}
