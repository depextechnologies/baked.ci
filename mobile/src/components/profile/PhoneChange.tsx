import { ChevronDown } from 'lucide-react-native';
import React, { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { api } from '@/lib/api';
import { PHONE_CODES } from '@/lib/auth';
import { notify } from '@/lib/notify';
import { useApp } from '@/state/AppContext';
import { useSession, type Customer } from '@/state/SessionContext';
import { colors, fonts, radius, themed } from '@/theme';
import { AppText } from '../ui/AppText';
import { Button, Touchable } from '../ui/Button';

type Challenge = { challenge_id: string; masked_phone: string; dev_code?: string };

// Change the account phone number: new number -> SMS code -> verified and saved by the backend.
export function PhoneChange({ color, onDone }: { color: string; onDone: () => void }) {
  const { t, country } = useApp();
  const { updateCustomer } = useSession();
  const [cc, setCc] = useState(country?.phone_code || '+225');
  const [menu, setMenu] = useState(false);
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [ch, setCh] = useState<Challenge | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const digits = phone.replace(/\D/g, '');
  const fail = (e: any) => setErr(e?.status === 0 ? t('common.network_error') : e?.status === 409 && /taken|used/i.test(e?.message) ? t('profile.phone_taken')
    : e?.status === 429 ? t('profile.too_many') : e?.status === 400 && ch ? t('profile.code_wrong') : e?.status === 422 ? t('login.invalid_phone') : e?.message || t('common.network_error'));

  const send = async () => {
    if (digits.length < 8) { setErr(t('login.invalid_phone')); return; }
    setBusy(true); setErr(null);
    try { setCh(await api<Challenge>('/customers/me/phone/request', { method: 'POST', body: { country_code: cc, phone: digits } })); setCode(''); }
    catch (e) { fail(e); } finally { setBusy(false); }
  };
  const verify = async () => {
    if (!ch || code.trim().length < 4) return;
    setBusy(true); setErr(null);
    try {
      updateCustomer(await api<Customer>('/customers/me/phone/verify', { method: 'POST', body: { challenge_id: ch.challenge_id, code: code.trim() } }));
      notify(t('profile.phone_updated'));
      onDone();
    } catch (e) { fail(e); } finally { setBusy(false); }
  };

  return (
    <View style={styles.box} testID="phone-change">
      {!ch ? (
        <>
          <AppText size={13} color={colors.textMuted}>{t('profile.new_phone')}</AppText>
          <View style={styles.field}>
            <Touchable testID="phone-change-cc" onPress={() => setMenu((o) => !o)} style={styles.cc}>
              <AppText weight="semibold" size={14}>{cc}</AppText><ChevronDown color={colors.textMuted} size={14} />
            </Touchable>
            <TextInput testID="phone-change-input" value={phone} onChangeText={(v) => { setPhone(v); setErr(null); }} keyboardType="phone-pad" maxLength={15}
              placeholder={t('login.phone_ph')} placeholderTextColor={colors.textDim} style={styles.input} />
          </View>
          {menu ? <View style={styles.menu}>{PHONE_CODES.map(([iso, c]) => (
            <Touchable key={c} testID={`phone-change-cc-${iso}`} onPress={() => { setCc(c); setMenu(false); }} style={styles.menuItem}><AppText size={14}>{iso}  {c}</AppText></Touchable>
          ))}</View> : null}
        </>
      ) : (
        <>
          <AppText size={13} color={colors.textMuted} testID="phone-change-sent">{t('profile.code_sent', { p: ch.masked_phone })}</AppText>
          {ch.dev_code ? <AppText size={12} color={colors.textDim} testID="phone-change-dev-code">DEV: {ch.dev_code}</AppText> : null}
          <TextInput testID="phone-change-code" value={code} onChangeText={(v) => { setCode(v.replace(/\D/g, '')); setErr(null); }} keyboardType="number-pad" maxLength={6}
            placeholder={t('profile.code_ph')} placeholderTextColor={colors.textDim} style={[styles.field, styles.input, { letterSpacing: 4 }]} />
        </>
      )}
      {err ? <AppText size={13} color={colors.danger} testID="phone-change-error">{err}</AppText> : null}
      <Button testID={ch ? 'phone-change-verify' : 'phone-change-send'} color={color} loading={busy} disabled={ch ? code.length < 4 : digits.length < 8}
        label={ch ? t('profile.verify') : t('profile.send_code')} onPress={ch ? verify : send} />
      <Touchable testID="phone-change-cancel" onPress={ch ? () => setCh(null) : onDone} style={{ alignSelf: 'center', padding: 6 }}>
        <AppText size={13} color={colors.textMuted}>{t('common.cancel')}</AppText>
      </Touchable>
    </View>
  );
}

const styles = themed(() => StyleSheet.create({
  box: { gap: 10, padding: 14, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface2 },
  field: { flexDirection: 'row', alignItems: 'center', height: 52, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, overflow: 'hidden' },
  cc: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, height: '100%', borderRightWidth: 1, borderRightColor: colors.border },
  input: { flex: 1, minWidth: 0, height: 52, paddingHorizontal: 14, color: colors.text, fontFamily: fonts.medium, fontSize: 15, outlineStyle: 'none' } as any,
  menu: { borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, overflow: 'hidden' },
  menuItem: { paddingHorizontal: 16, paddingVertical: 11 },
}));
