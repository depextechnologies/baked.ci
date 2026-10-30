import React from 'react';
import { RefreshControl, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';

import { useAccountSummary } from '@/hooks/useAccountSummary';
import { useHomepage } from '@/hooks/useHomepage';
import { useApp } from '@/state/AppContext';
import { colors, themed } from '@/theme';
import { AppGrid } from '../cms/app/AppGrid';
import { CmsSections } from '../cms/registry';
import { Skeleton } from '../ui/StateView';
import { AddressBar, SearchButton } from './AddressBar';
import { MainHeader } from './MainHeader';

// BAKĒD Super App home — every section below the address bar is published from Super Admin (module "baked").
export function MainHome() {
  const { country } = useApp();
  const { unread } = useAccountSummary();
  const { width } = useWindowDimensions();
  const cc = country?.code || 'CI';
  const hp = useHomepage('baked', cc);
  const sections = hp.data?.sections;

  return (
    <ScrollView testID="main-home" contentContainerStyle={{ paddingBottom: 28 }} showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={hp.refreshing} onRefresh={hp.refresh} tintColor={colors.accent} colors={[colors.accent]} />}>
      <MainHeader unread={unread} />
      <View style={styles.bar}>
        <AddressBar inline />
        <SearchButton />
      </View>
      {sections?.length ? (
        <CmsSections sections={sections} loading={false} offline={hp.offline} accent={colors.accent} module="baked" country={cc} width={width - 28} />
      ) : (
        <View style={{ gap: 22 }} testID="main-home-fallback">
          <AppGrid />
          {hp.loading ? <View style={styles.sk}><Skeleton h={104} r={14} /><Skeleton h={104} r={14} /></View> : null}
        </View>
      )}
    </ScrollView>
  );
}

const styles = themed(() => StyleSheet.create({
  bar: { flexDirection: 'row', gap: 10, paddingHorizontal: 14, marginBottom: 16 },
  sk: { paddingHorizontal: 14, gap: 16 },
}));
