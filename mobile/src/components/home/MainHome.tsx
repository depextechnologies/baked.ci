import React, { useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import { useAccountSummary } from '@/hooks/useAccountSummary';
import { useHomepage } from '@/hooks/useHomepage';
import { useApp } from '@/state/AppContext';
import { colors, themed } from '@/theme';
import { AppPromoSlider } from '../cms/app/AppPromoSlider';
import { Skeleton } from '../ui/StateView';
import { AddressBar } from './AddressBar';
import { HomeModuleCards } from './HomeModuleCards';
import { MainHeader } from './MainHeader';

// Clean BAKED home: logo, address, admin-managed promo banners, then the six module cards.
export function MainHome() {
  const { country } = useApp();
  const [viewH, setViewH] = useState(0);
  const [gridY, setGridY] = useState(0);
  const { unread } = useAccountSummary();
  const cc = country?.code || 'CI';
  const hp = useHomepage('baked', cc);
  const sections = hp.data?.sections || [];
  const promo = sections.find((s) => s.section_type === 'app_promo_slider');
  const grid = sections.find((s) => s.section_type === 'app_module_grid');

  return (
    <ScrollView testID="main-home" contentContainerStyle={{ paddingBottom: 12 }} onLayout={(e) => setViewH(e.nativeEvent.layout.height)} showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={hp.refreshing} onRefresh={hp.refresh} tintColor={colors.accent} colors={[colors.accent]} />}>
      <MainHeader unread={unread} />
      <View style={styles.bar}><AddressBar inline /></View>
      <View style={{ gap: 12 }} onLayout={(e) => setGridY(e.nativeEvent.layout.y)}>
        {promo ? <AppPromoSlider section={promo} accent={colors.accent} module="baked" country={cc} width={0} />
          : hp.loading ? <View style={styles.sk}><Skeleton h={150} r={18} /></View> : null}
        <HomeModuleCards items={grid?.config?.items} space={viewH && gridY ? viewH - gridY - (promo ? 168 : 0) - 12 - 12 : 0} />
      </View>
    </ScrollView>
  );
}

const styles = themed(() => StyleSheet.create({
  bar: { flexDirection: 'row', paddingHorizontal: 14, marginBottom: 12 },
  sk: { paddingHorizontal: 14 },
}));
