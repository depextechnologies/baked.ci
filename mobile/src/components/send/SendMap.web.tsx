import { MapPin, Navigation } from 'lucide-react-native';
import React from 'react';
import { StyleSheet, View } from 'react-native';

import type { LatLng } from '@/lib/routes';
import { useApp } from '@/state/AppContext';
import { colors } from '@/theme';
import { AppText } from '../ui/AppText';

export type SendMapProps = { points: LatLng[]; route: LatLng[]; driver?: LatLng | null; color: string; height?: number | `${number}%` };

// Web preview: route summary (native map renders on device).
export function SendMap({ driver, color, height = 140 }: SendMapProps) {
  const { t } = useApp();
  return (
    <View style={[styles.wrap, { height }]} testID="send-map-web">
      <MapPin color={color} size={22} />
      <AppText size={13} color={colors.textMuted} align="center">{t('trk.map_web')}</AppText>
      {driver ? <Navigation color={color} size={16} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: '100%', backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', gap: 6, padding: 16 },
});
