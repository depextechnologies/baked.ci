import { Image } from 'expo-image';
import React from 'react';
import { StyleSheet, View } from 'react-native';

import { HOME_GRID_ORDER, MODULES } from '@/lib/modules';
import { useApp } from '@/state/AppContext';
import { colors, hexA, radius } from '@/theme';
import { Logo } from '../Logo';
import { AppText } from '../ui/AppText';

export function BrandBanner() {
  const { t } = useApp();
  return (
    <View style={styles.wrap} testID="brand-banner">
      <View style={styles.left}>
        <Logo height={30} />
        <AppText size={13} style={{ marginTop: 8 }}>{t('home.banner_line1')}</AppText>
        <AppText weight="semibold" size={13} color="#A659FF">{t('home.banner_line2')}</AppText>
        <AppText size={13}>{t('home.banner_line3')}</AppText>
      </View>
      <View style={styles.right}>
        {HOME_GRID_ORDER.map((c) => (
          <View key={c} style={[styles.col, { backgroundColor: hexA(MODULES[c].color, 0.55) }]}>
            <Image source={MODULES[c].image} style={styles.colImg} contentFit="contain" />
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', marginHorizontal: 18, marginTop: 14, height: 132, borderRadius: radius.md, overflow: 'hidden', borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  left: { width: '40%', padding: 14, justifyContent: 'center' },
  right: { flex: 1, flexDirection: 'row' },
  col: { flex: 1, justifyContent: 'flex-end', paddingBottom: 8 },
  colImg: { width: '130%', height: 64, marginLeft: '-15%' },
});
