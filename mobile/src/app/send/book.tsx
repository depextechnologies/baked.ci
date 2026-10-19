import { Image } from 'expo-image';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { MapPin, Plus, X } from 'lucide-react-native';
import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { SendMap } from '@/components/send/SendMap';
import { AppText } from '@/components/ui/AppText';
import { Button, Touchable } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { Skeleton, StateView } from '@/components/ui/StateView';
import { useFetch } from '@/hooks/useFetch';
import { api } from '@/lib/api';
import { WEB_ORIGIN } from '@/lib/config';
import { formatMoney } from '@/lib/format';
import { MODULES } from '@/lib/modules';
import { sendLabel } from '@/lib/i18n-send-data';
import { notify } from '@/lib/notify';
import { computeRoute, type Route } from '@/lib/routes';
import { useApp } from '@/state/AppContext';
import { useSendDraft } from '@/state/SendDraftContext';
import { useSession } from '@/state/SessionContext';
import { colors, fonts, hexA, radius } from '@/theme';

const ORANGE = MODULES.express.color;
type Vehicle = { code: string; name: string; name_fr: string; description?: string; max_weight_kg: number; eta_min_min: number; eta_min_max: number };
type Quote = Record<string, any> & { total: number; currency: string; distance_km: number; duration_min: number };
type Opt = { code: string; name?: string; label?: string };
const ll = (a: { latitude: number; longitude: number }) => ({ lat: a.latitude, lng: a.longitude });
const point = (a: any) => ({ line1: a.line1, latitude: a.latitude, longitude: a.longitude, formatted_address: a.formatted_address, place_id: a.place_id, city: a.city, country: a.country });

export default function SendBook() {
  const { service = 'moto' } = useLocalSearchParams<{ service?: string }>();
  const { t, lang, country, address } = useApp();
  const { isAuthed, customer } = useSession();
  const { pickup, drops, setPoint, addStop, removeStop } = useSendDraft();
  const cc = country?.code || 'CI';
  const [step, setStep] = useState<'route' | 'vehicle' | 'details'>('route');
  const [route, setRoute] = useState<Route>({ coords: [], distanceKm: null, durationMin: null, road: false });
  const [vehicle, setVehicle] = useState<string | null>(null);
  const [quotes, setQuotes] = useState<Record<string, Quote>>({});
  const [form, setForm] = useState({ name: '', phone: '', pkg: '', weight: '', prefs: [] as string[], notes: '' });
  const [when, setWhen] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const multi = service === 'multiple_shipments' || drops.length > 1;
  // Several drops are always booked as the backend's multi-shipments service (its own vehicle set + stop pricing).
  const svc = drops.length > 1 ? 'multiple_shipments' : service;

  useEffect(() => { if (!pickup && address) setPoint('pickup', address); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const pts = useMemo(() => [pickup, ...drops].filter(Boolean).map((a) => ({ latitude: a!.latitude, longitude: a!.longitude })), [pickup, drops]);
  const ready = !!pickup && drops.every(Boolean);
  useEffect(() => { computeRoute(pts).then(setRoute); }, [JSON.stringify(pts)]); // eslint-disable-line react-hooks/exhaustive-deps

  const vehicles = useFetch<Vehicle[]>(`/express/vehicles?country=${cc}&service_type=${svc}`, [cc, svc]);
  const pkgs = useFetch<Opt[]>(`/express/package-types?country=${cc}`, [cc]);
  const tiers = useFetch<Opt[]>(`/express/weight-tiers?country=${cc}`, [cc]);
  const prefs = useFetch<Opt[]>(`/express/delivery-preferences?country=${cc}`, [cc]);

  useEffect(() => {
    if (step !== 'vehicle' || !ready || !vehicles.data) return;
    const legs = drops.map((d, i) => ({ pickup: ll(i === 0 ? pickup! : drops[i - 1]!), drop: ll(d!) }));
    Promise.all(vehicles.data.map((v) => (multi
      ? api<Quote>('/express/quote/multi_stop', { method: 'POST', auth: false, body: { country: cc, vehicle_code: v.code, stops: legs } })
      : api<Quote>('/express/quote/parcel', { method: 'POST', auth: false, body: { country: cc, vehicle_code: v.code, pickup_lat: pickup!.latitude, pickup_lng: pickup!.longitude, drop_lat: drops[0]!.latitude, drop_lng: drops[0]!.longitude } })
    ).then((q) => [v.code, q] as const).catch(() => null))).then((rows) => {
      setQuotes(Object.fromEntries(rows.filter(Boolean) as any));
      if (!vehicle && vehicles.data?.[0]) setVehicle(vehicles.data[0].code);
    });
  }, [step, ready, vehicles.data, JSON.stringify(pts)]); // eslint-disable-line react-hooks/exhaustive-deps

  const q = vehicle ? quotes[vehicle] : null;
  const money = (n: number) => formatMoney(n, q?.currency || 'XOF', undefined, lang);

  const book = async () => {
    if (!q || !vehicle || !pickup) return;
    setBusy(true);
    try {
      const receiver = { name: form.name.trim(), phone: form.phone.trim(), notes: form.notes || undefined, preferences: form.prefs };
      const b = await api<{ id: string }>('/express/bookings/parcel', { method: 'POST', body: {
        country: cc, vehicle_code: vehicle, service_type: svc, pickup: point(pickup), drop: point(multi ? drops[0]! : drops[drops.length - 1]!),
        stops: multi ? drops.map((d, i) => ({ pickup: { ...point(i === 0 ? pickup : drops[i - 1]!), ...ll(i === 0 ? pickup : drops[i - 1]!) },
          drop: { ...point(d!), ...ll(d!), receiver_name: receiver.name, receiver_phone: receiver.phone } })) : undefined,
        receiver, package_type: form.pkg || undefined, package_weight_range: form.weight || undefined, package_notes: form.notes || undefined,
        scheduled_for: when || undefined, payment_method: 'cod',
      } });
      router.replace(`/send/track/${b.id}` as any);
    } catch (e: any) { notify(e?.message || t('common.network_error')); } finally { setBusy(false); }
  };

  const slots = useMemo(() => {
    const out: string[] = []; const now = new Date();
    for (let d = 0; d < 7; d++) for (let h = 8; h <= 21; h++) for (const m of [0, 30]) {
      const x = new Date(now); x.setDate(now.getDate() + d); x.setHours(h, m, 0, 0);
      if (x.getTime() > now.getTime() + 45 * 60000) out.push(x.toISOString());
    }
    return out.slice(0, 40);
  }, []);
  const fmtSlot = (iso: string) => new Date(iso).toLocaleString(lang === 'fr' ? 'fr-FR' : 'en-GB', { weekday: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

  if (!isAuthed) return <Redirect href={`/login?redirect=/send/book?service=${service}` as any} />;
  return (
    <SafeAreaView style={styles.root} testID="send-book-screen">
      <ScreenHeader title={t('send.title')} />
      <SendMap points={pts} route={route.coords} color={ORANGE} height={step === 'route' ? 300 : 190} />
      <ScrollView contentContainerStyle={{ padding: 18, gap: 14, paddingBottom: 130 }} keyboardShouldPersistTaps="handled">
        {step === 'route' ? (
          <>
            <PointRow testID="send-pickup" label={t('send.pickup')} value={pickup?.line1} onPress={() => router.push('/address?send=pickup')} />
            {drops.map((d, i) => (
              <PointRow key={i} testID={`send-drop-${i}`} label={drops.length > 1 ? t('send.stop_n', { n: i + 1 }) : t('send.drop')} value={d?.line1}
                onPress={() => router.push(`/address?send=drop:${i}`)} onRemove={drops.length > 1 ? () => removeStop(i) : undefined} />
            ))}
            <Touchable testID="send-add-stop" onPress={addStop} style={styles.addStop}><Plus color={ORANGE} size={18} /><AppText weight="semibold" color={ORANGE}>{t('send.add_stop')}</AppText></Touchable>
            {route.distanceKm ? <AppText size={13} color={colors.textMuted} testID="send-route-summary">{route.distanceKm.toFixed(1)} km · {route.durationMin} min</AppText> : null}
          </>
        ) : step === 'vehicle' ? (
          <>
            <AppText weight="bold" size={17}>{t('send.vehicle')}</AppText>
            {vehicles.loading ? <Skeleton h={80} /> : !vehicles.data?.length ? <StateView title={t('send.no_vehicle')} /> : vehicles.data.map((v) => (
              <Touchable key={v.code} testID={`send-vehicle-${v.code}`} onPress={() => setVehicle(v.code)}
                style={[styles.vehicle, vehicle === v.code && { borderColor: ORANGE, backgroundColor: hexA(ORANGE, 0.08) }]}>
                <Image source={`${WEB_ORIGIN}/vehicles/${v.code}.png`} style={styles.vImg} contentFit="contain" />
                <View style={{ flex: 1 }}>
                  <AppText weight="bold" size={15}>{lang === 'fr' ? v.name_fr || v.name : v.name}</AppText>
                  <AppText size={12} color={colors.textMuted}>{t('send.max_kg', { kg: v.max_weight_kg })} · {v.eta_min_min}-{v.eta_min_max} min</AppText>
                </View>
                <AppText weight="black" size={15} testID={`send-vehicle-price-${v.code}`}>{quotes[v.code] ? money(quotes[v.code].total) : '…'}</AppText>
              </Touchable>
            ))}
            {q ? <FareCard q={q} money={money} /> : null}
          </>
        ) : (
          <>
            <AppText weight="bold" size={17}>{t('send.receiver')}</AppText>
            <Field testID="send-receiver-name" value={form.name} onChange={(v) => setForm({ ...form, name: v })} placeholder={t('send.receiver_name')} />
            <Field testID="send-receiver-phone" value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} placeholder={t('send.receiver_phone')} phone />
            <Group title={t('send.package_type')} items={pkgs.data} on={(c) => form.pkg === c} onPress={(c) => setForm({ ...form, pkg: c })} prefix="send-pkg" />
            <Group title={t('send.weight')} items={(tiers.data as any[] | null)?.map((w) => ({ code: w.code, name: w.max_kg ? `${w.min_kg ? `${w.min_kg}–` : '≤ '}${w.max_kg} kg` : `> ${w.min_kg} kg` }))} on={(c) => form.weight === c} onPress={(c) => setForm({ ...form, weight: c })} prefix="send-weight" />
            <Group title={t('send.prefs')} items={prefs.data} on={(c) => form.prefs.includes(c)} prefix="send-pref"
              onPress={(c) => setForm({ ...form, prefs: form.prefs.includes(c) ? form.prefs.filter((x) => x !== c) : [...form.prefs, c] })} />
            <Field testID="send-notes" value={form.notes} onChange={(v) => setForm({ ...form, notes: v })} placeholder={t('send.notes')} />
            <AppText weight="bold" size={15}>{t('send.when')}</AppText>
            <View style={styles.wrap}>
              <Chip testID="send-when-now" label={t('send.now')} on={!when} color={ORANGE} onPress={() => setWhen(null)} />
              <Chip testID="send-when-later" label={t('send.later')} on={!!when} color={ORANGE} onPress={() => setWhen(slots[0])} />
            </View>
            {when ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                {slots.map((s) => <Chip key={s} testID={`send-slot-${s}`} label={fmtSlot(s)} on={when === s} color={ORANGE} onPress={() => setWhen(s)} />)}
              </ScrollView>
            ) : null}
            {q ? <FareCard q={q} money={money} /> : null}
          </>
        )}
      </ScrollView>
      <View style={styles.footer}>
        {step === 'route' ? <Button testID="send-next-route" label={t('send.continue')} color={ORANGE} disabled={!ready} onPress={() => setStep('vehicle')} />
          : step === 'vehicle' ? <Button testID="send-next-vehicle" label={t('send.continue')} color={ORANGE} disabled={!q} onPress={() => setStep('details')} />
            : <Button testID="send-book" color={ORANGE} loading={busy} disabled={!q || form.name.trim().length < 2 || form.phone.trim().length < 8}
              label={t('send.book', { total: q ? money(q.total) : '' })} onPress={book} />}
        {step !== 'route' ? <Touchable testID="send-back-step" onPress={() => setStep(step === 'details' ? 'vehicle' : 'route')} style={{ alignSelf: 'center', marginTop: 10 }}>
          <AppText size={13} color={colors.textMuted}>← {t('common.cancel')}</AppText></Touchable> : null}
      </View>
    </SafeAreaView>
  );
}

function FareCard({ q, money }: { q: Quote; money: (n: number) => string }) {
  const { t } = useApp();
  const rows: [string, number][] = [
    [t('send.base'), q.base_fare], [t('send.distance_fare', { km: q.distance_km }), q.distance_fare], [t('send.time_fare', { min: q.duration_min }), q.time_fare],
    [t('send.surcharge'), (q.surcharge || 0) + (q.extra_stop_surcharge || 0)], [t('send.service_fee'), q.service_fee], [t('send.insurance'), q.insurance], [t('send.discount'), -(q.promo_discount || 0)],
  ];
  return (
    <View style={styles.card} testID="send-fare">
      <AppText weight="bold" size={15}>{t('send.fare')}</AppText>
      {rows.filter(([, v]) => v).map(([k, v]) => (
        <View key={k} style={styles.line}><AppText size={13} color={colors.textMuted}>{k}</AppText><AppText size={13}>{money(v)}</AppText></View>
      ))}
      <View style={styles.line}><AppText weight="black" size={16}>{t('cart.total')}</AppText><AppText weight="black" size={16} testID="send-fare-total">{money(q.total)}</AppText></View>
    </View>
  );
}

function PointRow({ label, value, onPress, onRemove, testID }: { label: string; value?: string; onPress: () => void; onRemove?: () => void; testID: string }) {
  const { t } = useApp();
  return (
    <Touchable testID={testID} onPress={onPress} style={styles.point} scale={0.99}>
      <MapPin color={ORANGE} size={20} />
      <View style={{ flex: 1 }}>
        <AppText size={11} color={colors.textMuted}>{label}</AppText>
        <AppText weight="semibold" size={14} numberOfLines={1} color={value ? colors.text : colors.textDim}>{value || t('send.choose_point')}</AppText>
      </View>
      {onRemove ? <Touchable testID={`${testID}-remove`} onPress={onRemove} hitSlop={8}><X color={colors.textMuted} size={18} /></Touchable> : null}
    </Touchable>
  );
}

function Field({ value, onChange, placeholder, testID, phone }: { value: string; onChange: (v: string) => void; placeholder: string; testID: string; phone?: boolean }) {
  return <TextInput testID={testID} value={value} onChangeText={onChange} placeholder={placeholder} placeholderTextColor={colors.textDim}
    keyboardType={phone ? 'phone-pad' : 'default'} style={styles.input} />;
}

function Group({ title, items, on, onPress, prefix }: { title: string; items: Opt[] | null | undefined; on: (c: string) => boolean; onPress: (c: string) => void; prefix: string }) {
  const { lang } = useApp();
  if (!items?.length) return null;
  return (
    <View style={{ gap: 8 }}>
      <AppText weight="bold" size={15}>{title}</AppText>
      <View style={styles.wrap}>{items.map((i) => <Chip key={i.code} testID={`${prefix}-${i.code}`} label={sendLabel(lang, i.code, i.name || i.label)} on={on(i.code)} color={ORANGE} onPress={() => onPress(i.code)} />)}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  point: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  addStop: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingVertical: 6 },
  vehicle: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  vImg: { width: 64, height: 44 },
  card: { padding: 16, gap: 8, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  line: { flexDirection: 'row', justifyContent: 'space-between' },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  input: { height: 50, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, color: colors.text, paddingHorizontal: 14, fontFamily: fonts.regular, fontSize: 15, outlineStyle: 'none' } as any,
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: 16, paddingBottom: 24, backgroundColor: '#0B0B0D', borderTopWidth: 1, borderTopColor: colors.border },
});
