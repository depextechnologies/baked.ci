import { Redirect, router } from 'expo-router';
import { MapPin } from 'lucide-react-native';
import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AddButton } from '@/components/commerce/QtyStepper';
import { AccessCard, Counter, MoversFare, SlotCard, type Building, type Slot } from '@/components/send/MoversParts';
import { SendMap } from '@/components/send/SendMap';
import { AppText } from '@/components/ui/AppText';
import { Button, Touchable } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { Skeleton } from '@/components/ui/StateView';
import { useFetch } from '@/hooks/useFetch';
import { api } from '@/lib/api';
import { formatMoney } from '@/lib/format';
import { sendLabel } from '@/lib/i18n-send-data';
import { MODULES } from '@/lib/modules';
import { nextDays, SIZE_PRESET, SIZES, type Size } from '@/lib/movers';
import { notify } from '@/lib/notify';
import { computeRoute, type Route } from '@/lib/routes';
import { useApp } from '@/state/AppContext';
import { useSendDraft } from '@/state/SendDraftContext';
import { useSession } from '@/state/SessionContext';
import { colors, hexA, radius } from '@/theme';

const ORANGE = MODULES.express.color;
const STEPS = ['route', 'type', 'items', 'access', 'when', 'review'] as const;
type Step = (typeof STEPS)[number];
type Item = { id: string; name: string; category_code: string; weight_kg: number; base_price: number };
const point = (a: any) => ({ line1: a.line1, latitude: a.latitude, longitude: a.longitude, formatted_address: a.formatted_address, place_id: a.place_id, city: a.city, country: a.country });

export default function MoversBook() {
  const { t, lang, country, address } = useApp();
  const { isAuthed } = useSession();
  const { pickup, drops, setPoint } = useSendDraft();
  const drop = drops[0];
  const cc = country?.code || 'CI';
  const [step, setStep] = useState<Step>('route');
  const [route, setRoute] = useState<Route>({ coords: [], distanceKm: null, durationMin: null, road: false });
  const [moveType, setMoveType] = useState<string | null>(null);
  const [size, setSize] = useState<Size | null>(null);
  const [cat, setCat] = useState<string | null>(null);
  const [qty, setQty] = useState<Record<string, number>>({});
  const [from, setFrom] = useState<Building>({ floor: 0, elevator: false });
  const [to, setTo] = useState<Building>({ floor: 0, elevator: false });
  const [labour, setLabour] = useState(2);
  const [date, setDate] = useState<string | null>(null);
  const [slot, setSlot] = useState<string | null>(null);
  const [quote, setQuote] = useState<Record<string, any> | null>(null);
  const [busy, setBusy] = useState(false);

  const types = useFetch<any[]>('/express/movers/move-types', []);
  const cats = useFetch<any[]>('/express/movers/categories', []);
  const items = useFetch<Item[]>(`/express/movers/items?country=${cc}`, [cc]);
  const slots = useFetch<Slot[]>(`/express/movers/time-slots?country=${cc}`, [cc]);
  const days = useMemo(() => nextDays(14), []);

  useEffect(() => { if (!pickup && address) setPoint('pickup', address); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const pts = useMemo(() => [pickup, drop].filter(Boolean).map((a) => ({ latitude: a!.latitude, longitude: a!.longitude })), [pickup, drop]);
  useEffect(() => { computeRoute(pts).then(setRoute); }, [JSON.stringify(pts)]); // eslint-disable-line react-hooks/exhaustive-deps

  const chosen = Object.entries(qty).filter(([, q]) => q > 0).map(([item_id, q]) => ({ item_id, qty: q }));
  const count = chosen.reduce((s, i) => s + i.qty, 0);
  const kg = chosen.reduce((s, i) => s + i.qty * (items.data?.find((x) => x.id === i.item_id)?.weight_kg || 0), 0);
  const slotRow = slots.data?.find((s) => s.code === slot);
  const curr = quote?.currency || 'XOF';

  const pickSize = (s: Size) => {
    setSize(s);
    const byName = Object.fromEntries((items.data || []).map((i) => [i.name, i.id]));
    setQty(Object.fromEntries(Object.entries(SIZE_PRESET[s]).filter(([n]) => byName[n]).map(([n, q]) => [byName[n], q])));
  };

  useEffect(() => {
    if (step !== 'review' || !pickup || !drop) return;
    setQuote(null);
    api<any>('/express/quote/movers', { method: 'POST', auth: false, body: {
      country: cc, pickup_lat: pickup.latitude, pickup_lng: pickup.longitude, drop_lat: drop.latitude, drop_lng: drop.longitude, items: chosen, labour_movers: labour,
      floors_pickup: from.floor, floors_drop: to.floor, stairs_pickup: !from.elevator && from.floor > 0, stairs_drop: !to.elevator && to.floor > 0, time_slot_surcharge: slotRow?.surcharge || 0,
    } }).then(setQuote).catch((e) => notify(e?.message || t('common.network_error')));
  }, [step]); // eslint-disable-line react-hooks/exhaustive-deps

  const book = async () => {
    if (!pickup || !drop || !moveType) return;
    setBusy(true);
    try {
      const b = await api<{ id: string }>('/express/bookings/movers', { method: 'POST', body: {
        country: cc, move_type: moveType, pickup: point(pickup), drop: point(drop), items: chosen, labour_movers: labour, payment_method: 'cod',
        pickup_building: { floor: from.floor, elevator: from.elevator, stairs: !from.elevator && from.floor > 0 },
        drop_building: { floor: to.floor, elevator: to.elevator, stairs: !to.elevator && to.floor > 0 },
        custom_items: size ? [{ name: `size:${size}` }] : [], scheduled_date: date, time_slot_code: slot,
      } });
      router.replace(`/send/track/${b.id}` as any);
    } catch (e: any) { notify(e?.message || t('common.network_error')); } finally { setBusy(false); }
  };

  const idx = STEPS.indexOf(step);
  const canNext = step === 'route' ? !!pickup && !!drop : step === 'type' ? !!moveType : step === 'items' ? count > 0 : step === 'when' ? !!date && !!slot : true;
  const fmtDay = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString(lang === 'fr' ? 'fr-FR' : 'en-GB', { weekday: 'short', day: 'numeric', month: 'short' });

  if (!isAuthed) return <Redirect href={'/login?redirect=/send/movers' as any} />;
  return (
    <SafeAreaView style={styles.root} testID="mv-screen">
      <ScreenHeader title={t('mv.title')} />
      <View style={styles.progress}>
        <View style={[styles.bar, { width: `${((idx + 1) / STEPS.length) * 100}%` }]} />
      </View>
      <View style={styles.stepHead}>
        <AppText size={12} color={colors.textMuted} testID="mv-step-label">{t('mv.step_n', { n: idx + 1, total: STEPS.length })}</AppText>
        <AppText weight="black" size={20}>{t(`mv.step_${step}` as any)}</AppText>
      </View>
      {step === 'route' ? <SendMap points={pts} route={route.coords} color={ORANGE} height={220} /> : null}
      <ScrollView contentContainerStyle={{ padding: 18, gap: 14, paddingBottom: 150 }} keyboardShouldPersistTaps="handled">
        {step === 'route' ? (
          <>
            <Point testID="mv-pickup" label={t('send.pickup')} value={pickup?.line1} onPress={() => router.push('/address?send=pickup')} />
            <Point testID="mv-drop" label={t('send.drop')} value={drop?.line1} onPress={() => router.push('/address?send=drop:0')} />
            {route.distanceKm ? <AppText size={13} color={colors.textMuted} testID="mv-route-summary">{route.distanceKm.toFixed(1)} km · {route.durationMin} min</AppText> : null}
          </>
        ) : step === 'type' ? (
          <>
            <AppText weight="bold" size={15}>{t('mv.move_type')}</AppText>
            {types.loading ? <Skeleton h={70} /> : (types.data || []).map((m) => (
              <Touchable key={m.code} testID={`mv-type-${m.code}`} onPress={() => setMoveType(m.code)} scale={0.99}
                style={[styles.option, moveType === m.code && { borderColor: ORANGE, backgroundColor: hexA(ORANGE, 0.08) }]}>
                <AppText weight="bold" size={15}>{sendLabel(lang, m.code, m.name)}</AppText>
                <AppText size={12} color={colors.textMuted}>{sendLabel(lang, m.description, m.description)}</AppText>
              </Touchable>
            ))}
            <AppText weight="bold" size={15} style={{ marginTop: 6 }}>{t('mv.size')}</AppText>
            <AppText size={12} color={colors.textMuted}>{t('mv.size_hint')}</AppText>
            <View style={styles.wrap}>{SIZES.map((s) => <Chip key={s} testID={`mv-size-${s}`} label={t(`mv.size.${s}` as any)} on={size === s} color={ORANGE} onPress={() => pickSize(s)} />)}</View>
          </>
        ) : step === 'items' ? (
          <>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              <Chip testID="mv-cat-all" label={t('mart.all')} on={!cat} color={ORANGE} onPress={() => setCat(null)} />
              {(cats.data || []).map((c) => <Chip key={c.code} testID={`mv-cat-${c.code}`} label={sendLabel(lang, c.code, c.name)} on={cat === c.code} color={ORANGE} onPress={() => setCat(c.code)} />)}
            </ScrollView>
            {items.loading ? <Skeleton h={200} /> : (items.data || []).filter((i) => !cat || i.category_code === cat).map((i) => (
              <View key={i.id} style={styles.item} testID={`mv-item-${i.id}`}>
                <View style={{ flex: 1 }}>
                  <AppText weight="semibold" size={14}>{sendLabel(lang, null, i.name)}</AppText>
                  <AppText size={12} color={colors.textMuted}>{i.weight_kg} kg · {formatMoney(i.base_price, curr, undefined, lang)}</AppText>
                </View>
                {qty[i.id] ? <Counter testID={`mv-item-qty-${i.id}`} value={qty[i.id]} max={50} onChange={(v) => setQty({ ...qty, [i.id]: v })} />
                  : <AddButton testID={`mv-item-add-${i.id}`} label={t('mart.add')} color={ORANGE} onPress={() => setQty({ ...qty, [i.id]: 1 })} />}
              </View>
            ))}
          </>
        ) : step === 'access' ? (
          <>
            <AccessCard prefix="mv-from" title={t('send.pickup')} value={from} onChange={setFrom} />
            <AccessCard prefix="mv-to" title={t('send.drop')} value={to} onChange={setTo} />
            <View style={[styles.option, styles.between]}>
              <AppText weight="bold" size={15}>{t('mv.labour')}</AppText>
              <Counter testID="mv-labour" value={labour} min={1} max={8} onChange={setLabour} />
            </View>
          </>
        ) : step === 'when' ? (
          <>
            <AppText weight="bold" size={15}>{t('mv.date')}</AppText>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {days.map((d) => <Chip key={d} testID={`mv-date-${d}`} label={fmtDay(d)} on={date === d} color={ORANGE} onPress={() => setDate(d)} />)}
            </ScrollView>
            <AppText weight="bold" size={15}>{t('mv.slot')}</AppText>
            {(slots.data || []).map((s) => <SlotCard key={s.code} s={s} on={slot === s.code} currency={curr} onPress={() => setSlot(s.code)} />)}
          </>
        ) : (
          <>
            <View style={styles.option} testID="mv-review-summary">
              <AppText weight="bold" size={15}>{sendLabel(lang, moveType)}{size ? ` · ${t(`mv.size.${size}` as any)}` : ''}</AppText>
              <AppText size={13} color={colors.textMuted}>{pickup?.line1} → {drop?.line1}</AppText>
              <AppText size={13} color={colors.textMuted}>{date ? fmtDay(date) : ''}{slotRow ? ` · ${sendLabel(lang, slotRow.code, slotRow.name)}` : ''} · {t('mv.labour')}: {labour}</AppText>
            </View>
            {quote ? <MoversFare q={quote} /> : <Skeleton h={260} />}
          </>
        )}
      </ScrollView>
      <View style={styles.footer}>
        {step === 'items' || step === 'access' ? <AppText size={13} color={colors.textMuted} align="center" testID="mv-items-count" style={{ marginBottom: 8 }}>{count ? t('mv.items_count', { n: count, kg: Math.round(kg) }) : t('mv.no_items')}</AppText> : null}
        {step === 'review'
          ? <Button testID="mv-book" color={ORANGE} loading={busy} disabled={!quote} label={t('mv.book', { total: quote ? formatMoney(quote.advance, curr, undefined, lang) : '' })} onPress={book} />
          : <Button testID={`mv-next-${step}`} color={ORANGE} label={t('send.continue')} disabled={!canNext} onPress={() => setStep(STEPS[idx + 1])} />}
        {idx > 0 ? <Touchable testID="mv-back" onPress={() => setStep(STEPS[idx - 1])} style={{ alignSelf: 'center', marginTop: 10 }}>
          <AppText size={13} color={colors.textMuted}>← {t(`mv.step_${STEPS[idx - 1]}` as any)}</AppText></Touchable> : null}
      </View>
    </SafeAreaView>
  );
}

function Point({ label, value, onPress, testID }: { label: string; value?: string; onPress: () => void; testID: string }) {
  const { t } = useApp();
  return (
    <Touchable testID={testID} onPress={onPress} style={[styles.option, styles.row]} scale={0.99}>
      <MapPin color={ORANGE} size={20} />
      <View style={{ flex: 1 }}>
        <AppText size={11} color={colors.textMuted}>{label}</AppText>
        <AppText weight="semibold" size={14} numberOfLines={1} color={value ? colors.text : colors.textDim}>{value || t('send.choose_point')}</AppText>
      </View>
    </Touchable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  progress: { height: 3, backgroundColor: colors.surface2, marginHorizontal: 18, borderRadius: 2, overflow: 'hidden' },
  bar: { height: 3, backgroundColor: ORANGE },
  stepHead: { paddingHorizontal: 18, paddingTop: 12, paddingBottom: 10, gap: 2 },
  option: { padding: 14, gap: 4, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  item: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: 16, paddingBottom: 24, backgroundColor: '#0B0B0D', borderTopWidth: 1, borderTopColor: colors.border },
});
