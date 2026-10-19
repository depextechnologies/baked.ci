import { Map } from 'lucide-react-native';
import React from 'react';
import { StyleSheet, View } from 'react-native';

import { useApp } from '@/state/AppContext';
import { colors } from '@/theme';
import { AppText } from '../ui/AppText';

export type Pt = { lat?: number | null; lng?: number | null } | null | undefined;

export function TrackMap(_: { origin: Pt; destination: Pt; driver: Pt; color: string }) {
  const { t } = useApp();
  return (
    <View style={styles.wrap} testID="track-map-web">
      <Map color={colors.textMuted} size={22} />
      <AppText size={13} color={colors.textMuted} style={{ flex: 1 }}>{t('trk.map_web')}</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, borderRadius: 18, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
});
