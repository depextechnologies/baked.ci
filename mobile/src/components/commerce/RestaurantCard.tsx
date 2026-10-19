import { Image } from 'expo-image';
import { router } from 'expo-router';
import { Bike, Clock, Star } from 'lucide-react-native';
import React from 'react';
import { StyleSheet, View } from 'react-native';

import { formatMoney } from '@/lib/format';
import { MODULES } from '@/lib/modules';
import { useApp } from '@/state/AppContext';
import { colors, radius } from '@/theme';
import { AppText } from '../ui/AppText';
import { Touchable } from '../ui/Button';

export type Restaurant = {
  id: string; slug: string; name: string; image?: string; cuisines?: string[]; rating?: number; review_count?: number;
  eta_min?: number; eta_max?: number; prep_time_min?: number; prep_time_max?: number; delivery_fee?: number; is_open?: boolean;
  distance_km?: number | null; mode_eligible?: boolean; delivery_unavailable_reason?: string | null; currency?: string;
};

export function RestaurantCard({ r, mode }: { r: Restaurant; mode?: string }) {
  const { t, lang } = useApp();
  const dim = r.is_open === false || r.mode_eligible === false;
  const a = r.eta_min ?? r.prep_time_min; const b = r.eta_max ?? r.prep_time_max;
  return (
    <Touchable testID={`restaurant-card-${r.id}`} onPress={() => router.push(`/food/restaurant/${r.id}`)} style={[styles.card, dim && { opacity: 0.55 }]} scale={0.98}>
      <View style={styles.img}>
        {r.image ? <Image source={r.image} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} /> : null}
        {r.is_open === false ? <View style={styles.flag}><AppText weight="bold" size={11}>{t('food.closed')}</AppText></View>
          : r.mode_eligible === false && mode ? <View style={styles.flag}><AppText weight="bold" size={11}>{t('food.unavailable_mode', { mode: t(`mode.${mode}` as any) })}</AppText></View> : null}
      </View>
      <View style={styles.body}>
        <View style={styles.row}>
          <AppText weight="bold" size={16} numberOfLines={1} style={{ flex: 1 }}>{r.name}</AppText>
          {r.rating ? (
            <View style={styles.rating}><Star color="#000" fill="#000" size={11} /><AppText weight="bold" size={12} color="#000">{r.rating.toFixed(1)}</AppText></View>
          ) : null}
        </View>
        <AppText size={12} color={colors.textMuted} numberOfLines={1}>{(r.cuisines || []).map((c) => c.replace(/_/g, ' ')).join(' · ')}</AppText>
        <View style={[styles.row, { gap: 12, marginTop: 2 }]}>
          {a != null && b != null ? <Meta icon={<Clock color={colors.textMuted} size={13} />} text={t('food.min', { a, b })} /> : null}
          <Meta icon={<Bike color={colors.textMuted} size={13} />} text={!r.delivery_fee ? t('food.free_delivery') : t('food.fee', { fee: formatMoney(r.delivery_fee, r.currency || 'XOF', undefined, lang) })} />
          {r.distance_km != null ? <AppText size={12} color={colors.textMuted}>{t('food.km', { d: r.distance_km })}</AppText> : null}
        </View>
      </View>
    </Touchable>
  );
}

const Meta = ({ icon, text }: { icon: React.ReactNode; text: string }) => (
  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>{icon}<AppText size={12} color={colors.textMuted}>{text}</AppText></View>
);

const styles = StyleSheet.create({
  card: { borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  img: { height: 150, backgroundColor: colors.surface2 },
  flag: { position: 'absolute', left: 10, top: 10, backgroundColor: 'rgba(0,0,0,0.75)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill },
  body: { padding: 12, gap: 3 },
  row: { flexDirection: 'row', alignItems: 'center' },
  rating: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: MODULES.food.color, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 8 },
});
