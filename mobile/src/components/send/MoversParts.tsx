import { Minus, Plus } from 'lucide-react-native';
import React from 'react';
import { StyleSheet, View } from 'react-native';

import { formatMoney } from '@/lib/format';
import { sendLabel, slotWindow } from '@/lib/i18n-send-data';
import { MODULES } from '@/lib/modules';
import { useApp } from '@/state/AppContext';
import { colors, hexA, radius, themed } from '@/theme';
import { AppText } from '../ui/AppText';
import { Touchable } from '../ui/Button';
import { Chip } from '../ui/Chip';

const ORANGE = MODULES.express.color;
export type Building = { floor: number; elevator: boolean };
export type Slot = { code: string; name: string; window: string; surcharge: number; badge?: string | null };

export function Counter({ value, onChange, min = 0, max = 30, testID, format }: { value: number; onChange: (v: number) => void; min?: number; max?: number; testID: string; format?: (v: number) => string }) {
  return (
    <View style={styles.counter} testID={testID}>
      <Touchable testID={`${testID}-minus`} disabled={value <= min} onPress={() => onChange(value - 1)} style={styles.cBtn} hitSlop={4}><Minus color={value <= min ? colors.textDim : ORANGE} size={16} /></Touchable>
      <AppText weight="bold" size={15} testID={`${testID}-value`} style={{ minWidth: 42, textAlign: 'center' }}>{format ? format(value) : value}</AppText>
      <Touchable testID={`${testID}-plus`} disabled={value >= max} onPress={() => onChange(value + 1)} style={styles.cBtn} hitSlop={4}><Plus color={value >= max ? colors.textDim : ORANGE} size={16} /></Touchable>
    </View>
  );
}

export function AccessCard({ title, value, onChange, prefix }: { title: string; value: Building; onChange: (b: Building) => void; prefix: string }) {
  const { t } = useApp();
  return (
    <View style={styles.card} testID={`${prefix}-card`}>
      <AppText weight="bold" size={15}>{title}</AppText>
      <View style={styles.between}>
        <AppText size={14} color={colors.textMuted}>{t('mv.floor')}</AppText>
        <Counter testID={`${prefix}-floor`} value={value.floor} max={30} onChange={(floor) => onChange({ ...value, floor })} format={(v) => (v ? `${v}` : t('mv.rdc'))} />
      </View>
      <View style={styles.wrap}>
        <Chip testID={`${prefix}-elevator`} label={t('mv.elevator')} on={value.elevator} color={ORANGE} onPress={() => onChange({ ...value, elevator: true })} />
        <Chip testID={`${prefix}-stairs`} label={t('mv.no_elevator')} on={!value.elevator} color={ORANGE} onPress={() => onChange({ ...value, elevator: false })} />
      </View>
    </View>
  );
}

export function SlotCard({ s, on, onPress, currency }: { s: Slot; on: boolean; onPress: () => void; currency: string }) {
  const { lang } = useApp();
  return (
    <Touchable testID={`mv-slot-${s.code}`} onPress={onPress} style={[styles.slot, on && { borderColor: ORANGE, backgroundColor: hexA(ORANGE, 0.08) }]} scale={0.99}>
      <View style={{ flex: 1 }}>
        <AppText weight="bold" size={15}>{sendLabel(lang, s.code, s.name)}</AppText>
        <AppText size={12} color={colors.textMuted}>{slotWindow(lang, s.window)}</AppText>
      </View>
      {s.badge ? <View style={styles.badge}><AppText size={10} weight="bold" color="#000">{sendLabel(lang, s.badge, s.badge)}</AppText></View> : null}
      <AppText weight="semibold" size={13}>{s.surcharge ? `+${formatMoney(s.surcharge, currency, undefined, lang)}` : '—'}</AppText>
    </Touchable>
  );
}

const FARE: [string, string][] = [
  ['transportation', 'mv.transportation'], ['packing', 'mv.packing'], ['loading_unloading', 'mv.loading'], ['labour', 'mv.labour_fee'], ['floor_fee', 'mv.floor_fee'],
  ['stair_fee', 'mv.stair_fee'], ['toll_permits', 'mv.tolls'], ['insurance', 'send.insurance'], ['time_slot_surcharge', 'mv.slot_fee'], ['taxes', 'mv.taxes'],
];

export function MoversFare({ q }: { q: Record<string, any> }) {
  const { t, lang } = useApp();
  const money = (n: number) => formatMoney(n, q.currency, undefined, lang);
  return (
    <View style={styles.card} testID="mv-fare">
      <AppText weight="bold" size={15}>{t('send.fare')} · {q.distance_km} km</AppText>
      {FARE.filter(([k]) => q[k]).map(([k, label]) => (
        <View key={k} style={styles.between}><AppText size={13} color={colors.textMuted}>{t(label as any)}</AppText><AppText size={13}>{money(q[k])}</AppText></View>
      ))}
      <View style={styles.between}><AppText weight="black" size={16}>{t('cart.total')}</AppText><AppText weight="black" size={16} testID="mv-fare-total">{money(q.total)}</AppText></View>
      <View style={[styles.between, styles.split]}>
        <AppText size={13} weight="semibold" color={ORANGE}>{t('mv.advance')}</AppText><AppText size={13} weight="bold" color={ORANGE} testID="mv-fare-advance">{money(q.advance)}</AppText>
      </View>
      <View style={styles.between}><AppText size={13} color={colors.textMuted}>{t('mv.remaining')}</AppText><AppText size={13} testID="mv-fare-remaining">{money(q.remaining)}</AppText></View>
    </View>
  );
}

const styles = themed(() => StyleSheet.create({
  counter: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 4, height: 38 },
  cBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  card: { padding: 16, gap: 10, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  between: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  slot: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  badge: { backgroundColor: ORANGE, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  split: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 10 },
}));
