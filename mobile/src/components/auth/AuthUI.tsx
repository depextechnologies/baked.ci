import { Image } from 'expo-image';
import { router } from 'expo-router';
import { ChevronDown, ChevronLeft, Eye, EyeOff } from 'lucide-react-native';
import React, { useState } from 'react';
import { ActivityIndicator, useWindowDimensions, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PHONE_CODES } from '@/lib/auth';
import { useApp } from '@/state/AppContext';
import { fonts } from '@/theme';
import { ModuleRing } from './ModuleRing';

// Approved login design tokens (always dark, independent of the app theme).
export const A = { bg: '#000000', blue: '#1D9BF0', text: '#FFFFFF', muted: '#A3A3A3', input: '#151515', border: '#303030', green: '#25D366', danger: '#FF6B6B' };
const LOGO = require('../../../assets/images/baked-logo-official.png');
const LOGO_RATIO = 1524 / 427;

export function AuthShell({ children, testID, onBack }: { children: React.ReactNode; testID: string; onBack?: () => void }) {
  const { lang, setLang } = useApp();
  const back = onBack || (() => (router.canGoBack() ? router.back() : router.replace('/')));
  return (
    <View style={s.root} testID={testID}>
      <ModuleRing size={520} style={s.ringBR} />
      <SafeAreaView style={{ flex: 1 }}>
        <View style={s.top}>
          <Pressable testID="auth-back" accessibilityLabel="back" onPress={back} style={s.backBtn} hitSlop={8}><ChevronLeft color={A.text} size={22} /></Pressable>
          <View style={s.lang} testID="auth-lang">
            {(['fr', 'en'] as const).map((l) => (
              <Pressable key={l} testID={`auth-lang-${l}`} onPress={() => setLang(l)} style={[s.langPill, lang === l && s.langOn]}>
                <Text style={[s.langTxt, { color: lang === l ? '#000' : A.muted }]}>{l.toUpperCase()}</Text>
              </Pressable>
            ))}
          </View>
        </View>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <ScrollView contentContainerStyle={s.body} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <View style={s.inner}>
              <Image source={LOGO} style={{ width: 220, height: 220 / LOGO_RATIO, alignSelf: 'center' }} contentFit="contain" accessibilityLabel="baked" testID="auth-logo" />
              {children}
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

export function AuthHeading({ line1, line2, sub }: { line1: string; line2?: string; sub?: string }) {
  return (
    <View style={{ marginTop: 18, marginBottom: 22 }}>
      <Text style={s.h1} testID="auth-title">{line1}{line2 ? <Text style={{ color: A.blue }}>{`\n${line2}`}</Text> : null}</Text>
      {sub ? <Text style={s.sub}>{sub}</Text> : null}
    </View>
  );
}

type BtnProps = { label: string; onPress: () => void; icon?: React.ReactNode; variant?: 'primary' | 'whatsapp' | 'outline'; loading?: boolean; disabled?: boolean; testID: string; flex?: boolean };
export function AuthButton({ label, onPress, icon, variant = 'outline', loading, disabled, testID, flex }: BtnProps) {
  const v = variant === 'primary' ? s.bPrimary : variant === 'whatsapp' ? s.bWhats : s.bOutline;
  const { width } = useWindowDimensions();
  // Side-by-side OTP buttons: shrink type on narrow phones so labels never truncate.
  const fs = !flex ? 16 : width < 350 ? 12 : width < 420 ? 14 : 16;
  return (
    <Pressable testID={testID} onPress={onPress} disabled={disabled || loading} accessibilityRole="button"
      style={({ pressed }) => [s.btn, v, flex && { flex: 1, paddingHorizontal: 6, gap: 6 }, (pressed || disabled) && { opacity: 0.75 }]}>
      {loading ? <ActivityIndicator color={A.text} /> : <>{icon}<Text style={[s.btnTxt, { fontSize: fs }, flex && { flexShrink: 1 }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{label}</Text></>}
    </Pressable>
  );
}

export function PhoneField({ cc, setCc, phone, setPhone, placeholder, error }: { cc: string; setCc: (c: string) => void; phone: string; setPhone: (p: string) => void; placeholder: string; error?: string | null }) {
  const [open, setOpen] = useState(false);
  return (
    <View>
      <View style={[s.field, error ? { borderColor: A.danger } : null]}>
        <Pressable testID="auth-cc" onPress={() => setOpen((o) => !o)} style={s.cc}>
          <Text style={s.ccTxt}>{cc}</Text><ChevronDown color={A.text} size={16} />
        </Pressable>
        <View style={s.divider} />
        <TextInput testID="auth-phone" value={phone} onChangeText={setPhone} keyboardType="phone-pad" maxLength={15} autoComplete="tel"
          placeholder={placeholder} placeholderTextColor={A.muted} style={s.input} />
      </View>
      {open ? (
        <View style={s.menu} testID="auth-cc-menu">
          {PHONE_CODES.map(([iso, c]) => (
            <Pressable key={c} testID={`auth-cc-${iso}`} onPress={() => { setCc(c); setOpen(false); }} style={s.menuItem}><Text style={s.ccTxt}>{iso}  {c}</Text></Pressable>
          ))}
        </View>
      ) : null}
      {error ? <Text style={s.err} testID="auth-phone-error">{error}</Text> : null}
    </View>
  );
}

export function AuthInput({ label, error, secure, testID, ...rest }: { label: string; error?: string | null; secure?: boolean; testID: string } & TextInputProps) {
  const [hide, setHide] = useState(true);
  return (
    <View style={{ gap: 6 }}>
      <Text style={s.label}>{label}</Text>
      <View style={[s.field, error ? { borderColor: A.danger } : null]}>
        <TextInput testID={testID} placeholderTextColor={A.muted} style={[s.input, { paddingLeft: 16 }]} secureTextEntry={secure && hide} {...rest} />
        {secure ? (
          <Pressable testID={`${testID}-toggle`} onPress={() => setHide((h) => !h)} style={{ paddingHorizontal: 14 }} hitSlop={8}>
            {hide ? <Eye color={A.muted} size={20} /> : <EyeOff color={A.muted} size={20} />}
          </Pressable>
        ) : null}
      </View>
      {error ? <Text style={s.err} testID={`${testID}-error`}>{error}</Text> : null}
    </View>
  );
}

export function OrDivider({ label }: { label: string }) {
  return (
    <View style={s.or}><View style={s.orLine} /><Text style={s.orTxt}>{label}</Text><View style={s.orLine} /></View>
  );
}

export function FooterLink({ text, link, onPress, testID }: { text: string; link: string; onPress: () => void; testID: string }) {
  return (
    <View style={s.footer}>
      <Text style={s.footTxt}>{text} </Text>
      <Pressable testID={testID} onPress={onPress} hitSlop={8}><Text style={[s.footTxt, { color: A.blue, fontFamily: fonts.semibold }]}>{link} →</Text></Pressable>
    </View>
  );
}

export const authText = StyleSheet.create({
  label: { color: A.text, fontFamily: fonts.semibold, fontSize: 15 },
  muted: { color: A.muted, fontFamily: fonts.regular, fontSize: 14 },
  err: { color: A.danger, fontFamily: fonts.medium, fontSize: 13 },
  link: { color: A.blue, fontFamily: fonts.semibold, fontSize: 14 },
});

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: A.bg, overflow: 'hidden' },
  ringBR: { bottom: -360, right: -300 },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, paddingTop: 6 },
  backBtn: { width: 44, height: 44, borderRadius: 22, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.55)', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.4)' },
  lang: { flexDirection: 'row', padding: 3, borderRadius: 999, borderWidth: 1, borderColor: A.border, backgroundColor: A.input },
  langPill: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999 },
  langOn: { backgroundColor: A.text },
  langTxt: { fontFamily: fonts.bold, fontSize: 14 },
  body: { flexGrow: 1, paddingHorizontal: 22, paddingTop: 14, paddingBottom: 30 },
  inner: { width: '100%', maxWidth: 480, alignSelf: 'center' },
  h1: { color: A.text, fontFamily: fonts.black, fontSize: 32, lineHeight: 38, textAlign: 'center' },
  sub: { color: A.muted, fontFamily: fonts.regular, fontSize: 16, textAlign: 'center', marginTop: 8 },
  field: { flexDirection: 'row', alignItems: 'center', height: 56, borderRadius: 16, borderWidth: 1, borderColor: A.border, backgroundColor: A.input, overflow: 'hidden' },
  cc: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, height: '100%' },
  ccTxt: { color: A.text, fontFamily: fonts.semibold, fontSize: 16 },
  divider: { width: 1, height: 28, backgroundColor: A.border },
  input: { flex: 1, minWidth: 0, height: 56, paddingHorizontal: 14, color: A.text, fontFamily: fonts.regular, fontSize: 16, outlineStyle: 'none' } as any,
  menu: { marginTop: 6, borderRadius: 14, borderWidth: 1, borderColor: A.border, backgroundColor: A.input, overflow: 'hidden' },
  menuItem: { paddingHorizontal: 16, paddingVertical: 12 },
  err: { color: A.danger, fontFamily: fonts.medium, fontSize: 13, marginTop: 6 },
  label: { color: A.text, fontFamily: fonts.semibold, fontSize: 14 },
  btn: { height: 54, borderRadius: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 10 },
  bPrimary: { backgroundColor: A.blue },
  bWhats: { backgroundColor: A.bg, borderWidth: 2, borderColor: A.green },
  bOutline: { backgroundColor: A.input, borderWidth: 1, borderColor: A.border },
  btnTxt: { color: A.text, fontFamily: fonts.semibold, fontSize: 16 },
  or: { flexDirection: 'row', alignItems: 'center', gap: 14, marginVertical: 20 },
  orLine: { flex: 1, height: 1, backgroundColor: A.border },
  orTxt: { color: A.muted, fontFamily: fonts.medium, fontSize: 14 },
  footer: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', flexWrap: 'wrap', marginTop: 22 },
  footTxt: { color: A.text, fontFamily: fonts.regular, fontSize: 15 },
});
