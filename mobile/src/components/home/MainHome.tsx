import React from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { useAccountSummary } from '@/hooks/useAccountSummary';
import { HOME_GRID_ORDER } from '@/lib/modules';
import { useApp } from '@/state/AppContext';
import { AddressBar, SearchBar } from './AddressBar';
import { BrandBanner } from './BrandBanner';
import { MainHeader } from './MainHeader';
import { ModuleCard } from './ModuleCard';
import { QuickStrip } from './QuickStrip';

export function MainHome() {
  const { t } = useApp();
  const { wallet, unread, points } = useAccountSummary();
  return (
    <ScrollView testID="main-home" contentContainerStyle={{ paddingBottom: 28 }} showsVerticalScrollIndicator={false}>
      <MainHeader wallet={wallet} unread={unread} />
      <AddressBar />
      <SearchBar placeholder={t('home.search_ph')} />
      <View style={styles.grid}>
        {HOME_GRID_ORDER.map((code) => <ModuleCard key={code} code={code} />)}
      </View>
      <QuickStrip wallet={wallet} points={points} />
      <BrandBanner />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 12, paddingHorizontal: 18 },
});
