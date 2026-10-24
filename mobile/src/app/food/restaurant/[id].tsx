import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { CalendarDays, Clock, Heart, Star } from 'lucide-react-native';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CartBar, CartButton } from '@/components/commerce/CartBar';
import { ItemSheet, type MenuItem } from '@/components/food/ItemSheet';
import { FoodModeToggle } from '@/components/module/FoodHomeSections';
import { AppText } from '@/components/ui/AppText';
import { Button, Touchable } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { ErrorView, Skeleton } from '@/components/ui/StateView';
import { useFetch } from '@/hooks/useFetch';
import { api } from '@/lib/api';
import { formatMoney } from '@/lib/format';
import { MODULES } from '@/lib/modules';
import { notify } from '@/lib/notify';
import { useApp } from '@/state/AppContext';
import { useCart } from '@/state/CartContext';
import { useSession } from '@/state/SessionContext';
import { colors, hexA, radius, themed } from '@/theme';

const GREEN = MODULES.food.color;
type Menu = {
  restaurant: { id: string; name: string; image?: string; cuisines?: string[]; rating?: number; review_count?: number; prep_time_min?: number; prep_time_max?: number; is_open?: boolean; delivery_enabled?: boolean; pickup_enabled?: boolean; address?: string | null };
  sections: { id: string; name_en: string; name_fr: string; items: MenuItem[] }[];
};

export default function RestaurantScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, lang, country } = useApp();
  const { isAuthed } = useSession();
  const { addFood, food, foodMode } = useCart();
  const { data, loading, error, reload } = useFetch<Menu>(`/food/restaurants/${id}/menu?country=${country?.code || 'CI'}`, [id, country?.code]);
  const resa = useFetch<{ enabled: boolean; paused: boolean }>(`/food/restaurants/${id}/reservation-config`, [id]);
  const [fav, setFav] = useState(false);
  const [item, setItem] = useState<MenuItem | null>(null);
  const scroll = useRef<any>(null);
  const offsets = useRef<Record<string, number>>({});

  useEffect(() => {
    if (isAuthed) api<{ restaurants: string[] }>('/food/customer/favourites/ids').then((r) => setFav(r.restaurants.includes(id))).catch(() => {});
  }, [isAuthed, id]);

  const toggleFav = useCallback(async () => {
    if (!isAuthed) { router.push(`/login?redirect=/food/restaurant/${id}`); return; }
    setFav(!fav);
    api<{ favourited: boolean }>('/food/customer/favourites/toggle', { method: 'POST', body: { target_type: 'restaurant', target_id: id } })
      .then((r) => setFav(r.favourited)).catch(() => setFav(fav));
  }, [isAuthed, fav, id]);

  const r = data?.restaurant;
  const canReserve = !!resa.data?.enabled && !resa.data?.paused;
  const otherRestaurant = food.some((l) => l.restaurant_id !== id);

  const onAdd = (o: Parameters<React.ComponentProps<typeof ItemSheet>['onAdd']>[0]) => {
    if (!item || !r) return;
    if (otherRestaurant) notify(t('food.other_restaurant'));
    addFood({ restaurant_id: r.id, restaurant_name: r.name, item_id: item.id, name: item.name, image: item.image, base_price: item.base_price, currency: item.currency, ...o });
    setItem(null);
  };

  return (
    <SafeAreaView style={styles.root} testID="food-restaurant-screen">
      <ScreenHeader title={r?.name || ''} right={
        <View style={{ flexDirection: 'row' }}>
          <Touchable testID="food-fav-toggle" onPress={toggleFav} style={styles.icon} accessibilityState={{ selected: fav }}>
            <Heart color={fav ? GREEN : colors.text} fill={fav ? GREEN : 'transparent'} size={22} />
          </Touchable>
          <CartButton />
        </View>
      } />
      {error ? <ErrorView onRetry={reload} /> : loading || !data || !r ? <View style={{ padding: 18, gap: 12 }}><Skeleton h={180} /><Skeleton h={80} /></View> : (
        <>
          <ScrollView ref={scroll} contentContainerStyle={{ paddingBottom: 110 }} stickyHeaderIndices={[1]}>
            <View>
              <View style={styles.hero}>{r.image ? <Image source={r.image} style={StyleSheet.absoluteFill} contentFit="cover" /> : null}</View>
              <View style={{ padding: 18, gap: 6 }}>
                <AppText weight="black" size={26} testID="food-restaurant-name">{r.name}</AppText>
                <AppText size={13} color={colors.textMuted}>{(r.cuisines || []).map((c) => c.replace(/_/g, ' ')).join(' · ')}</AppText>
                <View style={styles.metaRow}>
                  {r.rating ? <View style={styles.meta}><Star color="#FCC44C" fill="#FCC44C" size={14} /><AppText weight="semibold" size={13}>{r.rating} ({r.review_count})</AppText></View> : null}
                  {r.prep_time_min ? <View style={styles.meta}><Clock color={colors.textMuted} size={14} /><AppText size={13}>{t('food.min', { a: r.prep_time_min, b: r.prep_time_max || r.prep_time_min })}</AppText></View> : null}
                  {r.is_open === false ? <AppText weight="bold" size={13} color={colors.danger}>{t('food.closed')}</AppText> : null}
                </View>
              </View>
              <View style={{ marginTop: -10 }}><FoodModeToggle /></View>
              {foodMode === 'dine_in' ? <AppText size={13} color={colors.textMuted} style={{ paddingHorizontal: 18, marginTop: 10 }}>{t('food.dine_in_hint')}</AppText> : null}
              {canReserve ? (
                <View style={{ paddingHorizontal: 18, marginTop: 14 }}>
                  <Button testID="food-reserve-btn" variant="secondary" label={t('food.reserve')} icon={<CalendarDays color={colors.text} size={18} />}
                    onPress={() => router.push(isAuthed ? `/food/reserve/${r.id}` : `/login?redirect=/food/reserve/${r.id}`)} />
                </View>
              ) : null}
            </View>
            <View style={{ backgroundColor: colors.bg }}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
                {data.sections.map((s) => (
                  <Chip key={s.id} testID={`food-section-chip-${s.id}`} label={lang === 'en' ? s.name_en : s.name_fr}
                    onPress={() => scroll.current?.scrollTo({ y: offsets.current[s.id] || 0, animated: true })} />
                ))}
              </ScrollView>
            </View>
            {data.sections.map((s) => (
              <View key={s.id} onLayout={(e) => { offsets.current[s.id] = e.nativeEvent.layout.y; }} style={{ paddingHorizontal: 18 }} testID={`food-section-${s.id}`}>
                <AppText weight="bold" size={19} style={{ marginTop: 18, marginBottom: 8 }}>{lang === 'en' ? s.name_en : s.name_fr}</AppText>
                {s.items.map((it) => <MenuRow key={it.id} it={it} disabled={foodMode === 'dine_in' || r.is_open === false} onPress={() => setItem(it)} />)}
              </View>
            ))}
          </ScrollView>
          <ItemSheet item={item} onClose={() => setItem(null)} onAdd={onAdd} />
        </>
      )}
      <CartBar color={GREEN} />
    </SafeAreaView>
  );
}

function MenuRow({ it, onPress, disabled }: { it: MenuItem; onPress: () => void; disabled: boolean }) {
  const { t, lang } = useApp();
  const off = !it.is_available || disabled;
  return (
    <Touchable testID={`food-item-${it.id}`} disabled={off} onPress={onPress} style={[styles.item, !it.is_available && { opacity: 0.5 }]} scale={0.99}>
      <View style={{ flex: 1, gap: 4 }}>
        {it.is_veg ? <View style={styles.veg}><AppText weight="bold" size={10} color={GREEN}>{t('food.veg')}</AppText></View> : null}
        <AppText weight="semibold" size={15}>{it.name}</AppText>
        {it.description ? <AppText size={12} color={colors.textMuted} numberOfLines={2}>{it.description}</AppText> : null}
        <AppText weight="bold" size={14}>{formatMoney(it.base_price, it.currency, undefined, lang)}</AppText>
      </View>
      <View style={styles.thumb}>
        {it.image ? <Image source={it.image} style={StyleSheet.absoluteFill} contentFit="cover" /> : null}
        {!disabled ? (
          <View style={[styles.addPill, !it.is_available && { backgroundColor: colors.surface2 }]}>
            <AppText weight="bold" size={12} color={it.is_available ? '#000' : colors.textMuted}>{it.is_available ? t('mart.add') : t('food.sold_out')}</AppText>
          </View>
        ) : null}
      </View>
    </Touchable>
  );
}

const styles = themed(() => StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  icon: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  hero: { height: 190, backgroundColor: colors.surface2 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 4 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  chips: { gap: 8, paddingHorizontal: 18, paddingVertical: 12 },
  item: { flexDirection: 'row', gap: 12, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.borderSoft },
  thumb: { width: 104, height: 104, borderRadius: radius.md, overflow: 'hidden', backgroundColor: colors.surface2, justifyContent: 'flex-end', alignItems: 'center' },
  addPill: { marginBottom: 8, backgroundColor: GREEN, paddingHorizontal: 14, paddingVertical: 5, borderRadius: radius.pill },
  veg: { alignSelf: 'flex-start', borderWidth: 1, borderColor: hexA(GREEN, 0.6), paddingHorizontal: 6, borderRadius: 6 },
}));
