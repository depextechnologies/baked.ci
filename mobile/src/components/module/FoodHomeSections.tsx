import { router } from 'expo-router';
import { Heart } from 'lucide-react-native';
import React from 'react';
import { StyleSheet, View } from 'react-native';

import { useFetch } from '@/hooks/useFetch';
import { MODULES } from '@/lib/modules';
import { useApp } from '@/state/AppContext';
import { useCart, type FoodMode } from '@/state/CartContext';
import { useSession } from '@/state/SessionContext';
import { colors } from '@/theme';
import { RestaurantCard, type Restaurant } from '../commerce/RestaurantCard';
import { AppText } from '../ui/AppText';
import { Touchable } from '../ui/Button';
import { Chip } from '../ui/Chip';
import { Skeleton } from '../ui/StateView';

const GREEN = MODULES.food.color;

export function FoodModeToggle() {
  const { t } = useApp();
  const { foodMode, setFoodMode } = useCart();
  return (
    <View style={styles.modes} testID="food-mode-toggle">
      {(['delivery', 'pickup', 'dine_in'] as FoodMode[]).map((m) => (
        <Chip key={m} testID={`food-mode-${m}`} label={t(`mode.${m}` as any)} on={foodMode === m} onPress={() => setFoodMode(m)} color={GREEN} />
      ))}
    </View>
  );
}

export const discoverQuery = (cc: string, mode: string, lat?: number, lng?: number) =>
  `/food/restaurants/discover?country=${cc}&fulfillment_mode=${mode}${lat != null ? `&lat=${lat}&lng=${lng}` : ''}`;

export function FoodHomeSections() {
  const { t, country, address } = useApp();
  const { foodMode } = useCart();
  const { isAuthed } = useSession();
  const cc = country?.code || 'CI';
  const { data, loading } = useFetch<{ items: Restaurant[]; radius_km: number }>(
    `${discoverQuery(cc, foodMode, address?.latitude, address?.longitude)}&limit=6`, [cc, foodMode, address?.latitude]);

  return (
    <View>
      <View style={styles.headRow}>
        <AppText weight="bold" size={19}>{t('food.featured')}</AppText>
        {isAuthed ? (
          <Touchable testID="food-favourites-link" onPress={() => router.push('/food/favourites')} hitSlop={8}>
            <Heart color={GREEN} size={20} />
          </Touchable>
        ) : null}
      </View>
      {data?.radius_km ? <AppText size={12} color={colors.textMuted} style={{ paddingHorizontal: 18, marginTop: -6, marginBottom: 10 }}>{t('food.radius', { km: data.radius_km })}</AppText> : null}
      <View style={{ paddingHorizontal: 18, gap: 12 }} testID="food-featured">
        {loading ? [0, 1].map((i) => <Skeleton key={i} h={220} />)
          : (data?.items || []).map((r) => <RestaurantCard key={r.id} r={r} mode={foodMode} />)}
        <Touchable testID="food-see-all" onPress={() => router.push('/food/discover')} style={styles.all}>
          <AppText weight="bold" size={15} color={GREEN}>{t('food.see_all')}</AppText>
        </Touchable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  modes: { flexDirection: 'row', gap: 8, paddingHorizontal: 18, marginTop: 16 },
  headRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, marginTop: 24, marginBottom: 12 },
  all: { height: 50, borderRadius: 25, borderWidth: 1, borderColor: GREEN, alignItems: 'center', justifyContent: 'center' },
});
