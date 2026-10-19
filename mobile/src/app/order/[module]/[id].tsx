import { Image } from 'expo-image';
import { Redirect, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Check, RefreshCw, Star } from 'lucide-react-native';
import React, { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BrandName } from '@/components/BrandName';
import { TrackMap } from '@/components/commerce/TrackMap';
import { AppText } from '@/components/ui/AppText';
import { Button, Touchable } from '@/components/ui/Button';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { ErrorView, Skeleton } from '@/components/ui/StateView';
import { useReorder } from '@/hooks/useReorder';
import { api } from '@/lib/api';
import { formatMoney } from '@/lib/format';
import { statusLabel, type TKey } from '@/lib/i18n';
import { MODULES } from '@/lib/modules';
import { confirmAsk, notify } from '@/lib/notify';
import { useApp } from '@/state/AppContext';
import { useSession } from '@/state/SessionContext';
import { colors, fonts, hexA, radius } from '@/theme';
import { normaliseTracking, type Tracking } from '@/lib/tracking';

const POLL_MS = 10000;

export default function OrderScreen() {
  const { module, id } = useLocalSearchParams<{ module: 'mart' | 'food' | 'shop'; id: string }>();
  const { t, lang } = useApp();
  const reorder = useReorder();
  const { isAuthed } = useSession();
  const [trk, setTrk] = useState<Tracking | null>(null);
  const [error, setError] = useState(false);
  const color = MODULES[module].color;

  const load = useCallback(async () => {
    try {
      const raw = await api(module === 'mart' ? `/orders/${id}/tracking` : module === 'shop' ? `/shop/orders/${id}` : `/food/customer/orders/${id}/track`);
      setTrk(normaliseTracking(module, raw)); setError(false);
    } catch { setError(true); }
  }, [module, id]);

  useFocusEffect(useCallback(() => {
    if (!isAuthed) return undefined;
    load();
    const timer = setInterval(() => { if (!trk?.terminal) load(); }, POLL_MS);
    return () => clearInterval(timer);
  }, [load, trk?.terminal, isAuthed]));

  const cancel = async () => {
    if (!(await confirmAsk(t('trk.cancel_confirm'), t('trk.cancel'), t('common.cancel')))) return;
    try {
      await api(module === 'mart' ? `/orders/${id}/cancel` : `/food/customer/orders/${id}/cancel`, { method: 'POST', body: {} });
      notify(t('trk.cancelled')); load();
    } catch (e: any) { notify(e?.message || t('common.network_error')); }
  };

  const money = (n: number) => formatMoney(n, trk?.currency || 'XOF', undefined, lang);
  if (!isAuthed) return <Redirect href={`/login?redirect=/order/${module}/${id}` as any} />;

  return (
    <SafeAreaView style={styles.root} testID="order-screen">
      <ScreenHeader title={t('trk.title')} />
      {error && !trk ? <ErrorView onRetry={load} /> : !trk ? <View style={{ padding: 18, gap: 12 }}><Skeleton h={90} /><Skeleton h={240} /></View> : (
        <ScrollView contentContainerStyle={{ padding: 18, gap: 16, paddingBottom: 40 }}>
          <View style={[styles.card, { borderColor: hexA(color, 0.5) }]} testID="order-header">
            <BrandName code={module} size={16} />
            <AppText weight="black" size={22} testID="order-number">{t('trk.order', { n: trk.number })}</AppText>
            <View style={styles.row}>
              <View style={[styles.status, { backgroundColor: hexA(trk.cancelled ? colors.danger : color, 0.18) }]}>
                <AppText weight="bold" size={12} color={trk.cancelled ? colors.danger : color} testID="order-status">{statusLabel(lang, trk.status)}</AppText>
              </View>
              {!trk.terminal ? <View style={styles.row}><RefreshCw color={colors.textMuted} size={12} /><AppText size={11} color={colors.textMuted}>{t('trk.live')}</AppText></View> : null}
            </View>
            {trk.etaMin && !trk.terminal ? <AppText size={14} color={colors.textMuted}>{t('trk.eta', { m: trk.etaMin })}</AppText> : null}
            {trk.pickupPin ? <AppText weight="bold" size={14}>{t('trk.pickup_pin', { pin: trk.pickupPin })}</AppText> : null}
          </View>

          {!trk.cancelled ? (
            <View style={styles.card} testID="order-timeline">
              {trk.steps.map((s, i) => (
                <View key={s.code} style={styles.step} testID={`order-step-${s.code}`}>
                  <View style={{ alignItems: 'center' }}>
                    <View style={[styles.dot, s.done && { backgroundColor: color, borderColor: color }]}>{s.done ? <Check color="#000" size={12} strokeWidth={3} /> : null}</View>
                    {i < trk.steps.length - 1 ? <View style={[styles.lineV, s.done && { backgroundColor: color }]} /> : null}
                  </View>
                  <View style={{ flex: 1, paddingBottom: 14 }}>
                    <AppText weight={s.done ? 'bold' : 'medium'} size={14} color={s.done ? colors.text : colors.textMuted}>{t(`trk.step.${s.code}` as TKey)}</AppText>
                    {s.at ? <AppText size={11} color={colors.textDim}>{new Date(s.at).toLocaleTimeString(lang === 'fr' ? 'fr-FR' : 'en-GB', { hour: '2-digit', minute: '2-digit' })}</AppText> : null}
                  </View>
                </View>
              ))}
            </View>
          ) : null}

          {trk.driver && !trk.terminal ? (
            <View style={styles.card} testID="order-driver">
              <AppText weight="bold" size={15}>{t('trk.driver')}</AppText>
              <View style={styles.row}>
                <View style={styles.avatar}>{trk.driver.photo ? <Image source={trk.driver.photo} style={StyleSheet.absoluteFill} contentFit="cover" /> : null}</View>
                <View style={{ flex: 1 }}>
                  <AppText weight="semibold" size={15}>{trk.driver.name}</AppText>
                  <AppText size={12} color={colors.textMuted}>{[trk.driver.vehicle, trk.driver.plate].filter(Boolean).join(' · ')}</AppText>
                </View>
                {trk.driver.rating ? <View style={styles.row}><Star color="#FCC44C" fill="#FCC44C" size={13} /><AppText size={13}>{trk.driver.rating}</AppText></View> : null}
              </View>
              <TrackMap origin={trk.geo.origin} destination={trk.geo.destination} driver={trk.geo.driver} color={color} />
            </View>
          ) : null}

          <View style={styles.card} testID="order-items">
            <AppText weight="bold" size={15}>{t('trk.items')}</AppText>
            {trk.items.map((it, i) => (
              <View key={`${it.name}-${i}`} style={styles.row}>
                <AppText size={14} style={{ flex: 1 }}>{it.quantity} × {it.name}{it.extra ? <AppText size={12} color={colors.textMuted}>{`\n${it.extra}`}</AppText> : null}</AppText>
                <AppText weight="semibold" size={14}>{money(it.total)}</AppText>
              </View>
            ))}
            <View style={{ height: 1, backgroundColor: colors.border }} />
            <View style={styles.row}><AppText size={14} color={colors.textMuted} style={{ flex: 1 }}>{t('cart.delivery_fee')}</AppText><AppText size={14}>{trk.fee ? money(trk.fee) : t('cart.free')}</AppText></View>
            <View style={styles.row}><AppText weight="black" size={16} style={{ flex: 1 }}>{t('cart.total')}</AppText><AppText weight="black" size={16} testID="order-total">{money(trk.total)}</AppText></View>
          </View>

          {trk.canCancel ? <Button testID="order-cancel" variant="secondary" label={t('trk.cancel')} onPress={cancel} /> : null}
          {trk.delivered && module !== 'shop' ? <RateBox module={module as 'mart' | 'food'} id={id} rated={trk.rated} restaurantId={trk.raw?.restaurant_id} /> : null}
          {trk.terminal && module !== 'shop' ? <Button testID="order-reorder" color={color} label={t('trk.reorder')} onPress={() => reorder(module as 'mart' | 'food', trk.raw)} /> : null}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function RateBox({ module, id, rated }: { module: 'mart' | 'food'; id: string; rated: boolean; restaurantId?: string }) {
  const { t } = useApp();
  const [stars, setStars] = useState(0);
  const [text, setText] = useState('');
  const [done, setDone] = useState(rated);
  const [busy, setBusy] = useState(false);
  if (done) return <AppText testID="order-rated" size={14} color={colors.textMuted} align="center">{t('trk.rated')}</AppText>;
  const send = async () => {
    setBusy(true);
    try {
      if (module === 'mart') await api(`/orders/${id}/rate`, { method: 'POST', body: { rating: stars, comment: text || undefined } });
      else await api('/food/customer/reviews', { method: 'POST', body: { order_id: id, rating: stars, text: text || undefined } });
      setDone(true);
    } catch (e: any) { notify(e?.message || t('common.network_error')); } finally { setBusy(false); }
  };
  return (
    <View style={styles.card} testID="order-rate">
      <AppText weight="bold" size={15}>{t('trk.rate')}</AppText>
      <View style={[styles.row, { gap: 6 }]}>
        {[1, 2, 3, 4, 5].map((n) => (
          <Touchable key={n} testID={`order-rate-star-${n}`} onPress={() => setStars(n)} hitSlop={4}>
            <Star color="#FCC44C" fill={n <= stars ? '#FCC44C' : 'transparent'} size={32} />
          </Touchable>
        ))}
      </View>
      <TextInput testID="order-rate-text" value={text} onChangeText={setText} placeholder={t('trk.rate_ph')} placeholderTextColor={colors.textDim} style={styles.input} multiline />
      <Button testID="order-rate-send" label={t('trk.rate_send')} disabled={!stars} loading={busy} color={colors.accent} onPress={send} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  card: { padding: 16, gap: 10, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  status: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: radius.pill },
  step: { flexDirection: 'row', gap: 12 },
  dot: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: colors.textDim, alignItems: 'center', justifyContent: 'center' },
  lineV: { width: 2, flex: 1, minHeight: 16, backgroundColor: colors.border },
  avatar: { width: 46, height: 46, borderRadius: 23, overflow: 'hidden', backgroundColor: colors.surface2 },
  input: { minHeight: 60, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bg, color: colors.text, padding: 12, fontFamily: fonts.regular, fontSize: 14, textAlignVertical: 'top', outlineStyle: 'none' } as any,
});
