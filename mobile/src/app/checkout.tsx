import { Redirect, router } from 'expo-router';
import { Banknote, MapPin, Store } from 'lucide-react-native';
import React, { useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { TotalsCard } from '@/components/commerce/TotalsCard';
import { AppText } from '@/components/ui/AppText';
import { Button, Touchable } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { Skeleton } from '@/components/ui/StateView';
import { useCartTotals } from '@/hooks/useCartTotals';
import { useFetch } from '@/hooks/useFetch';
import { api } from '@/lib/api';
import { formatMoney } from '@/lib/format';
import { MODULES } from '@/lib/modules';
import { notify } from '@/lib/notify';
import { useApp } from '@/state/AppContext';
import { useCart, type FoodLine } from '@/state/CartContext';
import { useSession } from '@/state/SessionContext';
import { colors, fonts, hexA, radius } from '@/theme';

type Slot = { id: string; label: string; kind: string };
type Method = { code: string; label: string; label_fr: string; enabled: boolean };

export default function Checkout() {
  const { t, lang, address, country } = useApp();
  const { isAuthed, customer } = useSession();
  const { mart, food, foodMode, clearFood, reload } = useCart();
  const { totals } = useCartTotals();
  const cc = country?.code || 'CI';
  const hasMart = mart.length > 0;
  const foodType = foodMode === 'delivery' ? 'delivery' : 'pickup';
  const needsAddress = hasMart || (food.length > 0 && foodType === 'delivery');
  const slots = useFetch<Slot[]>(hasMart ? `/mart/delivery-slots?country=${cc}` : null, [cc, hasMart]);
  const methods = useFetch<Method[]>(`/mart/payment-methods?country=${cc}`, [cc]);
  const [slot, setSlot] = useState<string | null>(null);
  const [method, setMethod] = useState('cod');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const attempt = useRef(`${Date.now()}`);

  useEffect(() => { if (!slot && slots.data?.length) setSlot(slots.data[0].id); }, [slots.data, slot]);
  if (!isAuthed) return <Redirect href="/login?redirect=/checkout" />;
  if (!hasMart && !food.length) return <Redirect href="/cart" />;

  const money = (n: number) => formatMoney(n, totals?.currency || 'XOF', undefined, lang);
  const addressOk = !needsAddress || (address && address.latitude != null);

  const place = async () => {
    if (!addressOk) { notify(t('co.need_address')); return; }
    if (hasMart && !slot) { notify(t('co.need_slot')); return; }
    setBusy(true);
    const created: { module: 'mart' | 'food'; id: string }[] = [];
    const errors: string[] = [];
    if (hasMart && address) {
      try {
        const s = slots.data?.find((x) => x.id === slot);
        const o = await api<{ id: string }>('/orders', { method: 'POST', body: {
          address: { line1: address.line1, city: address.city, country: address.country, latitude: address.latitude, longitude: address.longitude,
            formatted_address: address.formatted_address, place_id: address.place_id, label: address.label },
          delivery_slot_id: slot, delivery_slot_label: s?.label, payment_method: method, instructions: notes || undefined,
        } });
        created.push({ module: 'mart', id: o.id });
      } catch (e: any) { errors.push(`MART: ${e?.message}`); }
    }
    const groups = food.reduce<Record<string, FoodLine[]>>((acc, l) => { (acc[l.restaurant_id] ||= []).push(l); return acc; }, {});
    for (const [rid, lines] of Object.entries(groups)) {
      try {
        const o = await api<{ id: string }>('/food/customer/orders', { method: 'POST', body: {
          restaurant_id: rid, order_type: foodType,
          items: lines.map((l) => ({ item_id: l.item_id, quantity: l.quantity, variant: l.variant || null, addons: l.addons, notes: l.notes || null })),
          delivery_address: foodType === 'delivery' && address ? { label: address.label, line1: address.line1, city: address.city, lat: address.latitude, lng: address.longitude, phone: customer?.phone, contact_name: customer?.name } : null,
          customer_snapshot: { name: customer?.name, phone: customer?.phone, email: customer?.email },
          payment_method: method, notes: notes || null, client_order_id: `m_${rid}_${attempt.current}`,
        } });
        created.push({ module: 'food', id: o.id });
        clearFood(rid);
      } catch (e: any) { errors.push(`${lines[0].restaurant_name}: ${e?.message}`); }
    }
    await reload();
    setBusy(false);
    if (errors.length) notify(t('co.partial', { msg: errors.join('\n') }));
    if (created.length) {
      if (!errors.length) notify(t('co.success'));
      router.replace(`/order/${created[0].module}/${created[0].id}` as any);
    }
  };

  return (
    <SafeAreaView style={styles.root} testID="checkout-screen">
      <ScreenHeader title={t('co.title')} />
      <ScrollView contentContainerStyle={{ padding: 18, gap: 16, paddingBottom: 140 }} keyboardShouldPersistTaps="handled">
        <View style={styles.card}>
          <AppText weight="bold" size={15}>{needsAddress ? t('co.address') : t('co.pickup_at')}</AppText>
          {needsAddress ? (
            <Touchable testID="checkout-address" onPress={() => router.push('/address')} style={styles.addr}>
              <MapPin color={colors.text} size={20} />
              <View style={{ flex: 1 }}>
                <AppText weight="semibold" size={14} numberOfLines={1} testID="checkout-address-title">{address ? address.line1 : t('addr.choose')}</AppText>
                <AppText size={12} color={addressOk ? colors.textMuted : colors.danger} numberOfLines={2}>{address ? address.formatted_address : t('co.need_address')}</AppText>
              </View>
              <AppText weight="semibold" size={13} color={colors.accent}>{t('co.change')}</AppText>
            </Touchable>
          ) : (
            <View style={styles.addr}><Store color={colors.text} size={20} /><AppText size={14} style={{ flex: 1 }}>{[...new Set(food.map((l) => l.restaurant_name))].join(', ')}</AppText></View>
          )}
        </View>
        {hasMart ? (
          <View style={styles.card}>
            <AppText weight="bold" size={15}>{t('co.slot')}</AppText>
            {slots.loading ? <Skeleton h={40} /> : (
              <View style={styles.wrap}>
                {(slots.data || []).map((s) => <Chip key={s.id} testID={`checkout-slot-${s.id}`} label={s.label} on={slot === s.id} color={MODULES.mart.color} onPress={() => setSlot(s.id)} />)}
              </View>
            )}
          </View>
        ) : null}
        <View style={styles.card}>
          <AppText weight="bold" size={15}>{t('co.payment')}</AppText>
          {(methods.data || []).map((m) => (
            <Touchable key={m.code} testID={`checkout-pay-${m.code}`} disabled={!m.enabled} onPress={() => setMethod(m.code)}
              style={[styles.method, method === m.code && { borderColor: colors.accent, backgroundColor: hexA(colors.accent, 0.08) }, !m.enabled && { opacity: 0.45 }]}>
              <Banknote color={colors.text} size={20} />
              <AppText weight="semibold" size={14} style={{ flex: 1 }}>{lang === 'fr' ? m.label_fr : m.label}</AppText>
              {!m.enabled ? <AppText size={11} color={colors.textMuted}>{t('co.unavailable_method')}</AppText> : null}
            </Touchable>
          ))}
        </View>
        <View style={styles.card}>
          <AppText weight="bold" size={15}>{t('co.instructions')}</AppText>
          <TextInput testID="checkout-instructions" value={notes} onChangeText={setNotes} maxLength={400} placeholder={t('co.instructions_ph')}
            placeholderTextColor={colors.textDim} style={styles.input} multiline />
        </View>
        {totals ? <TotalsCard totals={totals} money={money} /> : <Skeleton h={120} />}
      </ScrollView>
      <View style={styles.footer}>
        <Button testID="checkout-place-order" color={colors.accent} loading={busy} disabled={!totals || !addressOk}
          label={t('co.place', { total: totals ? money(totals.total) : '' })} onPress={place} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  card: { padding: 16, gap: 10, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  addr: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  method: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  input: { minHeight: 70, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bg, color: colors.text, padding: 12, fontFamily: fonts.regular, fontSize: 14, textAlignVertical: 'top', outlineStyle: 'none' } as any,
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: 16, paddingBottom: 28, backgroundColor: '#0B0B0D', borderTopWidth: 1, borderTopColor: colors.border },
});
