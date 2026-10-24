import { router, useLocalSearchParams } from 'expo-router';
import { Bookmark, LocateFixed, Map, MapPin, Search } from 'lucide-react-native';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PinMap } from '@/components/PinMap';
import { AppText } from '@/components/ui/AppText';
import { Button, Touchable } from '@/components/ui/Button';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { api } from '@/lib/api';
import { DEFAULT_COUNTRY } from '@/lib/config';
import { checkServiceable, detectCurrentAddress, reverseGeocode } from '@/lib/location';
import { notify } from '@/lib/notify';
import { autocomplete, newSessionToken, placeDetails, type PickedAddress, type Prediction } from '@/lib/places';
import { useApp } from '@/state/AppContext';
import { useSendDraft } from '@/state/SendDraftContext';
import { useSession } from '@/state/SessionContext';
import { colors, fonts, radius, themed } from '@/theme';

const ABIDJAN = { latitude: 5.3484, longitude: -4.0305 };

type Row = { key: string; icon: any; title: string; sub?: string; onPress: () => void; testID: string };

export default function AddressScreen() {
  const { next, send } = useLocalSearchParams<{ next?: string; send?: string }>();
  const draft = useSendDraft();
  const { t, lang, address, setAddress } = useApp();
  const { isAuthed } = useSession();
  const [q, setQ] = useState('');
  const [preds, setPreds] = useState<Prediction[]>([]);
  const [saved, setSaved] = useState<PickedAddress[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [mapMode, setMapMode] = useState(false);
  const center = useRef(address ? { latitude: address.latitude, longitude: address.longitude } : ABIDJAN);
  const token = useMemo(newSessionToken, []);
  const country = address?.country || DEFAULT_COUNTRY;

  useEffect(() => {
    if (!isAuthed) return;
    api<any[]>('/customers/me/addresses').then((rows) => setSaved(rows.filter((r) => r.latitude != null).map((r) => ({
      id: r.id, label: r.label, line1: r.line1, city: r.city, country: r.country,
      formatted_address: r.formatted_address || `${r.line1}, ${r.city}`, latitude: r.latitude, longitude: r.longitude,
    })))).catch(() => setSaved([]));
  }, [isAuthed]);

  useEffect(() => {
    if (q.trim().length < 2) { setPreds([]); return; }
    const id = setTimeout(() => autocomplete(q, country, lang, token).then(setPreds).catch(() => setPreds([])), 300);
    return () => clearTimeout(id);
  }, [q, country, lang, token]);

  const commit = async (a: PickedAddress) => {
    setBusy(true);
    if (send) { draft.setPoint(send, a); setBusy(false); router.back(); return; }
    const ok = await checkServiceable(a);
    setAddress(a);
    setBusy(false);
    if (!ok) notify(t('addr.not_serviceable'));
    if (next) router.replace(next as any); else if (router.canGoBack()) router.back(); else router.replace('/');
  };

  const run = async (fn: () => Promise<PickedAddress | null>) => {
    setBusy(true); setMsg(null);
    try { const a = await fn(); if (a) await commit(a); } catch { setMsg(t('common.network_error')); } finally { setBusy(false); }
  };

  const useCurrent = () => run(async () => {
    const r = await detectCurrentAddress(country, lang, t('loc.current_label'));
    if (r.status === 'ok') return r.address;
    setMsg(t(r.status === 'denied' ? 'loc.denied' : 'loc.unavailable'));
    return null;
  });

  const rows: Row[] = q.trim().length >= 2
    ? preds.map((p) => ({ key: p.placeId, icon: MapPin, title: p.main, sub: p.secondary, testID: `address-result-${p.placeId}`,
      onPress: () => run(() => placeDetails(p.placeId, country, lang, token)) }))
    : [
      { key: 'gps', icon: LocateFixed, title: t('loc.use_current'), testID: 'address-use-current', onPress: useCurrent },
      { key: 'map', icon: Map, title: t('addr.pin'), testID: 'address-pick-map', onPress: () => setMapMode(true) },
      ...saved.map((s) => ({ key: s.id!, icon: Bookmark, title: s.label, sub: s.formatted_address, testID: `address-saved-${s.id}`, onPress: () => commit(s) })),
    ];

  if (mapMode) {
    return (
      <SafeAreaView style={styles.root} testID="address-map-mode">
        <ScreenHeader title={t('addr.pin')} />
        <AppText size={13} color={colors.textMuted} style={{ paddingHorizontal: 18, marginBottom: 10 }}>{t('addr.pin_hint')}</AppText>
        <View style={{ flex: 1, marginHorizontal: 18 }}>
          <PinMap initial={center.current} onCenterChange={(c) => { center.current = c; }} />
        </View>
        <View style={{ padding: 18 }}>
          <Button testID="address-map-confirm" label={t('addr.confirm')} loading={busy} color={colors.accent}
            onPress={() => run(() => reverseGeocode(center.current.latitude, center.current.longitude, country, lang, t('addr.pin')))} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root} testID="address-screen">
      <ScreenHeader title={t('addr.title')} />
      <View style={styles.search}>
        <Search color={colors.textMuted} size={20} />
        <TextInput testID="address-search-input" value={q} onChangeText={setQ} placeholder={t('addr.search')} placeholderTextColor={colors.textDim}
          style={styles.input} autoFocus autoCorrect={false} returnKeyType="search" />
        {busy ? <ActivityIndicator color={colors.text} /> : null}
      </View>
      {msg ? <AppText testID="address-message" size={13} color="#FCC44C" style={{ paddingHorizontal: 18, marginBottom: 8 }}>{msg}</AppText> : null}
      {saved.length > 0 && q.length < 2 ? <AppText weight="semibold" size={12} color={colors.textMuted} style={styles.caption}>{t('addr.saved').toUpperCase()}</AppText> : null}
      <FlatList
        data={rows}
        keyExtractor={(r) => r.key}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={q.length >= 2 ? <AppText size={14} color={colors.textMuted} style={{ padding: 18 }}>{t('addr.none')}</AppText> : undefined}
        renderItem={({ item }) => (
          <Touchable testID={item.testID} onPress={item.onPress} style={styles.row} scale={0.99}>
            <View style={styles.rowIcon}><item.icon color={colors.text} size={18} /></View>
            <View style={{ flex: 1 }}>
              <AppText weight="semibold" size={15} numberOfLines={1}>{item.title}</AppText>
              {item.sub ? <AppText size={13} color={colors.textMuted} numberOfLines={1}>{item.sub}</AppText> : null}
            </View>
          </Touchable>
        )}
      />
    </SafeAreaView>
  );
}

const styles = themed(() => StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  search: { flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: 18, marginBottom: 12, paddingHorizontal: 16, height: 54, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  input: { flex: 1, minWidth: 0, color: colors.text, fontFamily: fonts.regular, fontSize: 16, height: '100%', outlineStyle: 'none' } as any,
  caption: { paddingHorizontal: 18, marginTop: 6, marginBottom: 4, letterSpacing: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 18, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.borderSoft },
  rowIcon: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' },
}));
