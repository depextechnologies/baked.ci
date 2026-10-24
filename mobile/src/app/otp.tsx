import { useLocalSearchParams } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText } from '@/components/ui/AppText';
import { Button, Touchable } from '@/components/ui/Button';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { api } from '@/lib/api';
import { requestOtp } from '@/lib/auth';
import { finishAuthFlow } from '@/lib/authFlow';
import { useApp } from '@/state/AppContext';
import { useSession, type Customer } from '@/state/SessionContext';
import { colors, fonts, radius } from '@/theme';

const LEN = 6;
const RESEND_S = 30;

export default function Otp() {
  const p = useLocalSearchParams<{ challenge: string; masked: string; dev?: string; cc: string; phone: string; redirect?: string }>();
  const { t, completeOnboarding } = useApp();
  const { signIn } = useSession();
  const [challenge, setChallenge] = useState(p.challenge);
  const [dev, setDev] = useState(p.dev || '');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [left, setLeft] = useState(RESEND_S);
  const input = useRef<any>(null);

  useEffect(() => {
    if (left <= 0) return;
    const id = setTimeout(() => setLeft((s) => s - 1), 1000);
    return () => clearTimeout(id);
  }, [left]);

  const verify = async (value = code) => {
    if (value.length !== LEN || busy) return;
    setBusy(true); setErr(null);
    try {
      const r = await api<{ access_token: string; customer: Customer }>('/auth/otp/verify', { method: 'POST', body: { challenge_id: challenge, code: value }, auth: false });
      await signIn(r.access_token, r.customer);
      completeOnboarding();
      finishAuthFlow(p.redirect);
    } catch (e: any) {
      setErr(e?.status === 0 ? t('common.network_error') : e?.message);
      setCode('');
    } finally { setBusy(false); }
  };

  const resend = async () => {
    try {
      const r = await requestOtp(p.cc, p.phone);
      setChallenge(r.challenge_id); setDev(r.dev_code || ''); setLeft(RESEND_S); setErr(null); setCode('');
    } catch (e: any) { setErr(e?.message || t('common.network_error')); }
  };

  return (
    <SafeAreaView style={styles.root} testID="otp-screen">
      <ScreenHeader title="" />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.body}>
        <AppText weight="black" size={28} style={{ letterSpacing: -0.6 }}>{t('otp.title')}</AppText>
        <AppText size={15} color={colors.textMuted} style={{ marginTop: 8, marginBottom: 28 }}>{t('otp.body', { phone: p.masked })}</AppText>
        <Pressable onPress={() => input.current?.focus()} style={styles.boxes}>
          {Array.from({ length: LEN }).map((_, i) => (
            <View key={i} style={[styles.box, code.length === i && styles.boxFocus, err ? { borderColor: colors.danger } : null]}>
              <AppText weight="bold" size={24}>{code[i] || ''}</AppText>
            </View>
          ))}
        </Pressable>
        <TextInput ref={input} testID="otp-input" value={code} autoFocus keyboardType="number-pad" maxLength={LEN}
          textContentType="oneTimeCode" autoComplete="sms-otp" style={styles.hidden}
          onChangeText={(v) => { const d = v.replace(/\D/g, ''); setCode(d); setErr(null); if (d.length === LEN) verify(d); }} />
        {err ? <AppText testID="otp-error" size={13} color={colors.danger} style={{ marginTop: 12 }}>{err}</AppText> : null}
        {dev ? <AppText testID="otp-dev-code" size={12} color={colors.textDim} style={{ marginTop: 12 }}>{t('otp.dev_code', { code: dev })}</AppText> : null}
        <View style={{ marginTop: 22 }}>
          {left > 0 ? <AppText size={14} color={colors.textMuted} testID="otp-resend-timer">{t('otp.resend_in', { s: left })}</AppText> : (
            <Touchable testID="otp-resend" onPress={resend}><AppText weight="semibold" size={14} color={colors.accent}>{t('otp.resend')}</AppText></Touchable>
          )}
        </View>
        <View style={{ flex: 1 }} />
        <Button testID="otp-verify" label={t('otp.verify')} loading={busy} disabled={code.length !== LEN} onPress={() => verify()} color="#FF4C52" textColor="#fff" />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  body: { flex: 1, paddingHorizontal: 24, paddingTop: 12, paddingBottom: 16 },
  boxes: { flexDirection: 'row', justifyContent: 'space-between' },
  box: { width: '14.5%', aspectRatio: 0.85, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  boxFocus: { borderColor: colors.accent, borderWidth: 2 },
  hidden: { position: 'absolute', opacity: 0, height: 1, width: 1, fontFamily: fonts.regular },
});
