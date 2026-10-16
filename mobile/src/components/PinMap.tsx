import React, { useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import MapView, { type Region } from 'react-native-maps';
import { MapPin } from 'lucide-react-native';

import { colors } from '@/theme';

type Props = { initial: { latitude: number; longitude: number }; onCenterChange: (c: { latitude: number; longitude: number }) => void };

// Fixed centre pin over a draggable map — the map centre is the selected point.
export function PinMap({ initial, onCenterChange }: Props) {
  const region = useRef<Region>({ ...initial, latitudeDelta: 0.01, longitudeDelta: 0.01 }).current;
  return (
    <View style={styles.wrap} testID="pin-map">
      <MapView
        style={StyleSheet.absoluteFill}
        initialRegion={region}
        showsUserLocation
        userInterfaceStyle="dark"
        onRegionChangeComplete={(r) => onCenterChange({ latitude: r.latitude, longitude: r.longitude })}
      />
      <View pointerEvents="none" style={styles.pin}><MapPin color={colors.accent} fill="#000" size={40} /></View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, borderRadius: 18, overflow: 'hidden', backgroundColor: colors.surface },
  pin: { position: 'absolute', left: '50%', top: '50%', marginLeft: -20, marginTop: -40 },
});
