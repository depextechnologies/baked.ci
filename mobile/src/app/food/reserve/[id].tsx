import { router, useLocalSearchParams } from 'expo-router';
import { Minus, Plus } from 'lucide-react-native';
import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText } from '@/components/ui/AppText';
import { Button, Touchable } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { Skeleton, StateView } from '@/components/ui/StateView';
import { useFetch } from '@/hooks/useFetch';
import { api } from '@/lib/api';
import { MODULES } from '@/lib/modules';
import { notify } from '@/lib/notify';
import { useApp } from '@/state/AppContext';
import { useSession } from '@/state/SessionContext';
import { colors, fonts, radius, themed } from '@/theme';

const GREEN = MODULES.food.color;
type Config = { restaurant: { name: string }; enabled: boolean; min_party_size: number; max_party_size: number; advance_booking_days: number };
type Slot = { slot: string; iso: string; available: boolean; remaining: number };
const isoDay = (d: Date) => d.toISOString().slice(0, 10);

export default function Reserve() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, lang } = useApp();
  const { customer } = useSession();
  const cfg = useFetch<Config>(`/food/restaurants/${id}/reservation-config`, [id]);
  const days = useMemo(() => Array.from({ length: 14 }, (_, i) => { const d = new Date(); d.setDate(d.getDate() + i); return d; }), []);
  const [day, setDay] = useState(isoDay(days[0]));
  const [party, setParty] = useState(2);
  const [slot, setSlot] = useState<string | null>(null);
  const [name, setName] = useState(customer?.name || '');
  const [phone, setPhone] = useState(customer?.phone || '');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const slots = useFetch<{ slots: Slot[] }>(cfg.data?.enabled ? `/food/restaurants/${id}/reservation-slots?date=${day}&party_size=${party}` : null, [day, party, cfg.data?.enabled]);

  const submit = async () => {
    if (!slot) return;
    setBusy(true);
    try {
      await api(`/food/restaurants/${id}/reservations`, { method: 'POST', body: { reservation_at: slot, party_size: party, guest_name: name.trim(), guest_phone: phone.trim(), notes: notes.trim() || undefined } });
      notify(t('resa.success'));
      router.replace('/activity');
    } catch (e: any) { notify(e?.message || t('common.network_error')); } finally { setBusy(false); }
  };

  if (cfg.error) return <SafeAreaView style={styles.root}><ScreenHeader title={t('resa.title')} /><StateView title={t('resa.unavailable')} /></SafeAreaView>;
  const min = cfg.data?.min_party_size || 1; const max = cfg.data?.max_party_size || 12;

  return (
    <SafeAreaView style={styles.root} testID="food-reserve-screen">
      <ScreenHeader title={cfg.data ? `${t('resa.title')} · ${cfg.data.restaurant.name}` : t('resa.title')} />
      <ScrollView contentContainerStyle={{ padding: 18, gap: 20, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
        <View style={{ gap: 10 }}>
          <AppText weight="bold" size={15}>{t('resa.date')}</AppText>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {days.map((d) => {
              const key = isoDay(d);
              return <Chip key={key} testID={`resa-day-${key}`} color={GREEN} on={day === key} onPress={() => { setDay(key); setSlot(null); }}
                label={d.toLocaleDateString(lang === 'fr' ? 'fr-FR' : 'en-GB', { weekday: 'short', day: 'numeric', month: 'short' })} />;
            })}
          </ScrollView>
        </View>
        <View style={styles.partyRow}>
          <AppText weight="bold" size={15} style={{ flex: 1 }}>{t('resa.party')}</AppText>
          <Touchable testID="resa-party-minus" onPress={() => { setParty(Math.max(min, party - 1)); setSlot(null); }} style={styles.pBtn}><Minus color={GREEN} size={18} /></Touchable>
          <AppText weight="bold" size={18} testID="resa-party-value">{party}</AppText>
          <Touchable testID="resa-party-plus" onPress={() => { setParty(Math.min(max, party + 1)); setSlot(null); }} style={styles.pBtn}><Plus color={GREEN} size={18} /></Touchable>
        </View>
        <View style={{ gap: 10 }}>
          <AppText weight="bold" size={15}>{t('resa.slots')}</AppText>
          {slots.loading ? <Skeleton h={90} /> : (slots.data?.slots || []).filter((s) => s.available).length === 0
            ? <AppText size={14} color={colors.textMuted} testID="resa-no-slots">{t('resa.no_slots')}</AppText> : (
              <View style={styles.wrap}>
                {(slots.data?.slots || []).filter((s) => s.available).map((s) => (
                  <Chip key={s.iso} testID={`resa-slot-${s.slot}`} color={GREEN} on={slot === s.iso} label={s.slot} onPress={() => setSlot(s.iso)} />
                ))}
              </View>
            )}
        </View>
        {([['resa.name', name, setName, 'resa-name'], ['resa.phone', phone, setPhone, 'resa-phone'], ['resa.notes', notes, setNotes, 'resa-notes']] as const).map(([k, v, set, tid]) => (
          <View key={k} style={{ gap: 8 }}>
            <AppText weight="bold" size={15}>{t(k)}</AppText>
            <TextInput testID={tid} value={v} onChangeText={set} style={styles.input} placeholderTextColor={colors.textDim}
              keyboardType={k === 'resa.phone' ? 'phone-pad' : 'default'} />
          </View>
        ))}
        <Button testID="resa-submit" label={t('resa.confirm')} color={GREEN} loading={busy}
          disabled={!slot || name.trim().length < 2 || phone.trim().length < 5} onPress={submit} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = themed(() => StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  partyRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  pBtn: { width: 40, height: 40, borderRadius: 20, borderWidth: 1.5, borderColor: GREEN, alignItems: 'center', justifyContent: 'center' },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  input: { height: 50, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, color: colors.text, paddingHorizontal: 14, fontFamily: fonts.regular, fontSize: 15, outlineStyle: 'none' } as any,
}));
