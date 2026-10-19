import { Image } from 'expo-image';
import { Redirect, useLocalSearchParams } from 'expo-router';
import { Phone, Radio, Star, WifiOff } from 'lucide-react-native';
import React, { useEffect, useMemo, useState } from 'react';
import { Linking, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { SendMap } from '@/components/send/SendMap';
import { AppText } from '@/components/ui/AppText';
import { Button, Touchable } from '@/components/ui/Button';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { Skeleton, StateView } from '@/components/ui/StateView';
import { useBookingSocket } from '@/hooks/useBookingSocket';
import { useFetch } from '@/hooks/useFetch';
import { api } from '@/lib/api';
import { formatMoney } from '@/lib/format';
import { slotWindow, sendLabel } from '@/lib/i18n-send-data';
import type { TKey } from '@/lib/i18n';
import { MODULES } from '@/lib/modules';
import { confirmAsk, notify } from '@/lib/notify';
import { computeRoute, type LatLng } from '@/lib/routes';
import { useApp } from '@/state/AppContext';
import { useSession } from '@/state/SessionContext';
import { colors, hexA, radius } from '@/theme';

const ORANGE = MODULES.express.color;
const FLOW = ['searching', 'driver_assigned', 'arriving', 'picked_up', 'in_transit', 'delivered'];
const MV_FLOW = ['confirmed', 'driver_assigned', 'arriving', 'picked_up', 'in_transit', 'delivered'];
const STALE_S = 60;
const pt = (p: any): LatLng | null => (p?.latitude != null ? { latitude: p.latitude, longitude: p.longitude } : p?.lat != null ? { latitude: p.lat, longitude: p.lng } : null);
const km = (a: LatLng, b: LatLng) => {
  const r = Math.PI / 180; const x = Math.sin(((b.latitude - a.latitude) * r) / 2) ** 2 + Math.cos(a.latitude * r) * Math.cos(b.latitude * r) * Math.sin(((b.longitude - a.longitude) * r) / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(x));
};

export default function SendTrack() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, lang } = useApp();
  const { isAuthed } = useSession();
  const { booking: b, live, lastFix, terminal, denied, refresh } = useBookingSocket(id);
  const [route, setRoute] = useState<LatLng[]>([]);
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const i = setInterval(() => setNow(Date.now()), 5000); return () => clearInterval(i); }, []);

  const stops = useMemo(() => {
    if (!b) return [];
    const legs = (b.stops || []).map((s: any) => pt(s.drop)).filter(Boolean) as LatLng[];
    return [pt(b.pickup), ...(legs.length ? legs : [pt(b.drop)])].filter(Boolean) as LatLng[];
  }, [b?.id, JSON.stringify(b?.stops)]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (stops.length > 1) computeRoute(stops).then((r) => setRoute(r.coords)); }, [stops]);

  const mv = b?.booking_type === 'movers';
  if (!isAuthed) return <Redirect href={`/login?redirect=/send/track/${id}` as any} />;
  const driver = pt(b?.driver_location);
  const target = b && ['picked_up', 'in_transit'].includes(b.status) ? stops[stops.length - 1] : stops[0];
  const remaining = driver && target ? km(driver, target) : null;
  const stale = lastFix && !terminal && b?.driver_id ? Math.round((now - lastFix) / 1000) : 0;
  const flow = mv ? MV_FLOW : FLOW;
  const stLabel = (s: string) => (mv && s !== 'cancelled' ? t(`mv.st.${s}` as TKey) : t(`send.st.${s}` as TKey)) || s;
  const cur = Math.max(0, flow.indexOf(b?.status));
  const ds = b?.driver_snapshot;

  const cancel = async () => {
    if (!(await confirmAsk(t('trk.cancel_confirm'), t(mv ? 'mv.cancel' : 'send.cancel'), t('common.cancel')))) return;
    try { await api(`/express/bookings/${id}/cancel`, { method: 'POST', body: {} }); notify(t(mv ? 'mv.cancelled' : 'send.cancelled')); refresh(); } catch (e: any) { notify(e?.message || t('common.network_error')); }
  };

  return (
    <SafeAreaView style={styles.root} testID="send-track-screen">
      <ScreenHeader title={t(mv ? 'mv.track' : 'send.track')} right={
        <View style={[styles.liveDot, { backgroundColor: live ? hexA(ORANGE, 0.18) : colors.surface2 }]} testID={live ? 'send-live' : 'send-offline'}>
          {live ? <Radio color={ORANGE} size={14} /> : <WifiOff color={colors.textMuted} size={14} />}
          <AppText size={11} weight="bold" color={live ? ORANGE : colors.textMuted}>{live ? t('send.live') : '10 s'}</AppText>
        </View>
      } />
      <SendMap points={stops} route={route} driver={driver} color={ORANGE} height={300} />
      {denied && !b ? <StateView testID="send-not-found" kind="error" title={t('common.login_required')} /> : !b ? <View style={{ padding: 18 }}><Skeleton h={160} /></View> : (
        <ScrollView contentContainerStyle={{ padding: 18, gap: 14, paddingBottom: 40 }}>
          <View style={styles.card}>
            <AppText size={12} color={colors.textMuted}>#{b.ref}</AppText>
            <AppText weight="black" size={22} testID="send-status">{stLabel(b.status)}</AppText>
            {b.status === 'searching' ? <AppText size={13} color={colors.textMuted} testID="send-searching-hint">{t('send.searching_hint')}</AppText> : null}
            {!terminal && b.eta_seconds ? <AppText size={14} testID="send-eta">{t('send.eta', { m: Math.max(1, Math.round(b.eta_seconds / 60)) })}</AppText> : null}
            {!terminal && remaining != null ? <AppText size={13} color={colors.textMuted} testID="send-remaining">{t('send.remaining', { km: remaining.toFixed(1) })}</AppText> : null}
            {!live && !terminal ? <AppText size={12} color="#FCC44C" testID="send-reconnecting">{t('send.reconnecting')}</AppText> : null}
            {stale > STALE_S ? <AppText size={12} color="#FCC44C" testID="send-stale">{t('send.stale', { s: stale })}</AppText> : null}
          </View>
          {b.status !== 'cancelled' ? (
            <View style={styles.card} testID="send-timeline">
              {flow.map((s, i) => (
                <View key={s} style={styles.step}>
                  <View style={[styles.dot, i <= cur && { backgroundColor: ORANGE, borderColor: ORANGE }]} />
                  <AppText size={14} weight={i <= cur ? 'bold' : 'regular'} color={i <= cur ? colors.text : colors.textMuted}>{stLabel(s)}</AppText>
                </View>
              ))}
            </View>
          ) : null}
          {mv ? <MoversSummary b={b} /> : null}
          {ds && !terminal ? (
            <View style={[styles.card, styles.row]} testID="send-driver">
              <View style={styles.avatar}>{ds.photo ? <Image source={ds.photo} style={StyleSheet.absoluteFill} /> : null}</View>
              <View style={{ flex: 1 }}>
                <AppText weight="bold" size={15}>{ds.name}</AppText>
                <AppText size={12} color={colors.textMuted}>{[ds.vehicle, ds.vehicle_reg || ds.plate].filter(Boolean).join(' · ')}</AppText>
              </View>
              {ds.rating ? <View style={styles.row}><Star color="#FCC44C" fill="#FCC44C" size={13} /><AppText size={13}>{ds.rating}</AppText></View> : null}
              {ds.phone ? <Touchable testID="send-call-driver" onPress={() => Linking.openURL(`tel:${ds.phone}`)} style={styles.call}><Phone color="#000" size={18} /></Touchable> : null}
            </View>
          ) : null}
          <View style={[styles.card, styles.row]}>
            <AppText size={14} color={colors.textMuted} style={{ flex: 1 }}>{mv ? t('mv.total') : `${t('cart.total')} · ${t('mode.delivery')}`}</AppText>
            <AppText weight="black" size={16} testID="send-total">{formatMoney(Number(b.total), b.currency, b.currency_symbol, lang)}</AppText>
          </View>
          {['searching', 'driver_assigned', 'confirmed'].includes(b.status) ? <Button testID="send-cancel" variant="secondary" label={t(mv ? 'mv.cancel' : 'send.cancel')} onPress={cancel} /> : null}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function MoversSummary({ b }: { b: any }) {
  const { t, lang } = useApp();
  const slots = useFetch<any[]>(`/express/movers/time-slots?country=${b.country || 'CI'}`, [b.country]);
  const slot = slots.data?.find((s) => s.code === b.time_slot_code);
  const q = b.quote_breakdown || {};
  const money = (n: number) => formatMoney(Number(n), b.currency, b.currency_symbol, lang);
  const d = b.scheduled_for ? new Date(b.scheduled_for).toLocaleDateString(lang === 'fr' ? 'fr-FR' : 'en-GB', { weekday: 'long', day: 'numeric', month: 'long' }) : null;
  return (
    <View style={styles.card} testID="mv-summary">
      <AppText weight="bold" size={15}>{t('mv.summary')} · {sendLabel(lang, b.move_type)}</AppText>
      {d ? <AppText size={13} testID="mv-summary-date">{t('mv.scheduled', { d })}{slot ? ` · ${sendLabel(lang, slot.code, slot.name)} (${slotWindow(lang, slot.window)})` : ''}</AppText> : null}
      {q.total_items ? <AppText size={13} color={colors.textMuted}>{t('mv.items_count', { n: q.total_items, kg: q.total_weight_kg })} · {t('mv.labour')}: {b.labour_movers}</AppText> : null}
      {b.advance != null ? <AppText size={13} testID="mv-summary-advance">{t('mv.advance')}: {money(b.advance)} · {t('mv.remaining')}: {money(b.remaining)}</AppText> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  card: { padding: 16, gap: 6, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  step: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 4 },
  dot: { width: 14, height: 14, borderRadius: 7, borderWidth: 2, borderColor: colors.textDim },
  avatar: { width: 46, height: 46, borderRadius: 23, overflow: 'hidden', backgroundColor: colors.surface2 },
  call: { width: 40, height: 40, borderRadius: 20, backgroundColor: ORANGE, alignItems: 'center', justifyContent: 'center' },
  liveDot: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.pill },
});
