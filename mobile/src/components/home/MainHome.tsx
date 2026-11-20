import React from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import { useAccountSummary } from '@/hooks/useAccountSummary';
import { useHomepage } from '@/hooks/useHomepage';
import { useApp } from '@/state/AppContext';
import { AppText } from '../ui/AppText';
import { colors, themed } from '@/theme';
import { AppPromoSlider } from '../cms/app/AppPromoSlider';
import { Skeleton } from '../ui/StateView';
import { AddressBar } from './AddressBar';
import { HomeModuleCards } from './HomeModuleCards';
import { MainHeader } from './MainHeader';

// Clean BAKED home: logo, address, admin-managed promo banners, then the six module cards.
export function MainHome() {
  const { country, lang } = useApp();
  const { unread } = useAccountSummary();
  const cc = country?.code || 'CI';
  const hp = useHomepage('baked', cc);
  const sections = hp.data?.sections || [];
  const promo = sections.find((s) => s.section_type === 'app_promo_slider');
  const grid = sections.find((s) => s.section_type === 'app_module_grid');

  return (
    <ScrollView testID="main-home" contentContainerStyle={{ paddingBottom: 28 }} showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={hp.refreshing} onRefresh={hp.refresh} tintColor={colors.accent} colors={[colors.accent]} />}>
      <MainHeader unread={unread} />
      <View style={styles.bar}><AddressBar inline /></View>
      <View style={{ gap: 12 }}>
        {promo ? <AppPromoSlider section={promo} accent={colors.accent} module="baked" country={cc} width={0} />
          : hp.loading ? <View style={styles.sk}><Skeleton h={150} r={18} /></View> : null}
        <View style={styles.head} testID="home-ecosystem-heading">
          <AppText weight="black" size={26} align="center">{lang === 'en' ? 'Baked ' : 'Écosystème '}<AppText weight="black" size={26} color="#1D9BF0">{lang === 'en' ? 'Ecosystem' : 'Baked'}</AppText></AppText>
          <AppText size={14} color={colors.textMuted} align="center" testID="home-ecosystem-sub">{lang === 'en' ? 'The everyday everything app.' : 'L’app de tout, au quotidien.'}</AppText>
        </View>
        <HomeModuleCards items={grid?.config?.items} />
      </View>
    </ScrollView>
  );
}

const styles = themed(() => StyleSheet.create({
  bar: { flexDirection: 'row', paddingHorizontal: 14, marginBottom: 12 },
  sk: { paddingHorizontal: 14 },
  head: { paddingHorizontal: 14, gap: 2, marginBottom: 2 },
}));
