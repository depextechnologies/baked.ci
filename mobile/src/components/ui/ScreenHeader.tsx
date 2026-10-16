import { router } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import React from 'react';
import { StyleSheet, View } from 'react-native';

import { colors } from '@/theme';
import { AppText } from './AppText';
import { Touchable } from './Button';

export function ScreenHeader({ title, right }: { title: string; right?: React.ReactNode }) {
  return (
    <View style={styles.row}>
      <Touchable testID="header-back" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} style={styles.back} hitSlop={8}>
        <ChevronLeft color={colors.text} size={22} />
      </Touchable>
      <AppText weight="bold" size={18} style={{ flex: 1 }} numberOfLines={1}>{title}</AppText>
      {right}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 10 },
  back: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' },
});
