import { router } from 'expo-router';
import { Check, LocateFixed, MapPin, PenLine } from 'lucide-react-native';
import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText } from '@/components/ui/AppText';
import { Button, Touchable } from '@/components/ui/Button';
import { DEFAULT_COUNTRY } from '@/lib/config';
import { detectCurrentAddress } from '@/lib/location';
import { useApp } from '@/state/AppContext';
import { colors, radius } from '@/theme';

export default function LocationPermission() {
  const { t, lang, setAddress } = useApp();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const useCurrent = async () => {
    setBusy(true); setMsg(null);
    const r = await detectCurrentAddress(DEFAULT_COUNTRY, lang, t('loc.current_label'));
    setBusy(false);
    if (r.status === 'ok') { setAddress(r.address); router.replace('/welcome'); return; }
    setMsg(t(r.status === 'denied' ? 'loc.denied' : 'loc.unavailable'));
  };

  return (
    <SafeAreaView style={styles.root} testID="location-permission-screen">
      <View style={styles.top}>
        <Touchable testID="location-skip" onPress={() => router.replace('/welcome')} hitSlop={10}>
          <AppText weight="semibold" size={15} color={colors.textMuted}>{t('common.skip')}</AppText>
        </Touchable>
      </View>
      <View style={styles.body}>
        <View style={styles.halo}><View style={styles.pin}><MapPin color="#000" size={34} strokeWidth={2.4} /></View></View>
        <AppText weight="black" size={28} style={{ letterSpacing: -0.6, marginTop: 28 }}>{t('loc.title')}</AppText>
        <AppText size={15} color={colors.textMuted} style={{ marginTop: 10 }}>{t('loc.body')}</AppText>
        <View style={{ marginTop: 22, gap: 12 }}>
          {(['loc.point1', 'loc.point2', 'loc.point3'] as const).map((k) => (
            <View key={k} style={styles.point}>
              <View style={styles.check}><Check color={colors.accent} size={14} strokeWidth={3} /></View>
              <AppText size={14} style={{ flex: 1 }}>{t(k)}</AppText>
            </View>
          ))}
        </View>
        {msg ? <AppText testID="location-message" size={13} color="#FCC44C" style={{ marginTop: 18 }}>{msg}</AppText> : null}
      </View>
      <View style={styles.actions}>
        <Button testID="location-use-current" label={busy ? t('loc.detecting') : t('loc.use_current')} loading={busy} onPress={useCurrent}
          color={colors.accent} icon={<LocateFixed color="#000" size={20} />} />
        <Button testID="location-manual" variant="secondary" label={t('loc.manual')} icon={<PenLine color={colors.text} size={18} />}
          onPress={() => router.push('/address?next=/welcome')} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  top: { flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: 20, paddingTop: 8 },
  body: { flex: 1, paddingHorizontal: 24, justifyContent: 'center' },
  halo: { width: 110, height: 110, borderRadius: 55, backgroundColor: 'rgba(119,188,31,0.14)', alignItems: 'center', justifyContent: 'center' },
  pin: { width: 70, height: 70, borderRadius: 35, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  point: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  check: { width: 24, height: 24, borderRadius: 12, backgroundColor: 'rgba(119,188,31,0.16)', alignItems: 'center', justifyContent: 'center' },
  actions: { paddingHorizontal: 24, paddingBottom: 16, gap: 12 },
});
