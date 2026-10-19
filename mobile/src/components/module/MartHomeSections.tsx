import { router } from 'expo-router';
import React from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { useFetch } from '@/hooks/useFetch';
import { MODULES } from '@/lib/modules';
import { useApp } from '@/state/AppContext';
import type { MartProduct } from '@/state/CartContext';
import { hexA, radius } from '@/theme';
import { ProductCard } from '../commerce/ProductCard';
import { AppText } from '../ui/AppText';
import { Touchable } from '../ui/Button';
import { Skeleton } from '../ui/StateView';

type Offer = { id: string; title: string; subtitle?: string; color?: string };

export function MartHomeSections() {
  const { t, country } = useApp();
  const cc = country?.code || 'CI';
  const offers = useFetch<Offer[]>(`/mart/offers?country=${cc}`, [cc]);
  const popular = useFetch<MartProduct[]>(`/mart/products?country=${cc}&sort=popularity&limit=10`, [cc]);

  return (
    <View>
      {offers.data?.length ? (
        <>
          <AppText weight="bold" size={19} style={styles.section}>{t('mart.offers')}</AppText>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hscroll}>
            {offers.data.map((o) => {
              const c = o.color || MODULES.mart.color;
              return (
                <Touchable key={o.id} testID={`mart-offer-${o.id}`} onPress={() => router.push('/mart/category/all')}
                  style={[styles.offer, { backgroundColor: hexA(c, 0.16), borderColor: hexA(c, 0.5) }]}>
                  <AppText weight="black" size={16} color={c} numberOfLines={2}>{o.title}</AppText>
                  {o.subtitle ? <AppText size={12} numberOfLines={2}>{o.subtitle}</AppText> : null}
                </Touchable>
              );
            })}
          </ScrollView>
        </>
      ) : null}
      <View style={styles.headRow}>
        <AppText weight="bold" size={19}>{t('mart.popular')}</AppText>
        <Touchable testID="mart-see-all" onPress={() => router.push('/mart/category/all')}>
          <AppText weight="semibold" size={13} color={MODULES.mart.color}>{t('common.see_all')}</AppText>
        </Touchable>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hscroll} testID="mart-popular">
        {popular.loading ? [0, 1, 2].map((i) => <View key={i} style={{ width: 150 }}><Skeleton h={230} /></View>)
          : (popular.data || []).map((p) => <ProductCard key={p.id} p={p} width={150} />)}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { paddingHorizontal: 18, marginTop: 24, marginBottom: 12 },
  headRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, marginTop: 24, marginBottom: 12 },
  hscroll: { gap: 10, paddingHorizontal: 18 },
  offer: { width: 230, minHeight: 92, padding: 14, borderRadius: radius.lg, borderWidth: 1, gap: 4, justifyContent: 'center' },
});
