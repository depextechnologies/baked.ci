import React from 'react';
import { StyleSheet, View } from 'react-native';
import MapView, { Marker } from 'react-native-maps';

import { getScheme, colors, themed } from '@/theme';

export type Pt = { lat?: number | null; lng?: number | null } | null | undefined;
type Props = { origin: Pt; destination: Pt; driver: Pt; color: string };

const ok = (p: Pt): p is { lat: number; lng: number } => p?.lat != null && p?.lng != null;

// Live map: store/restaurant, delivery address and the assigned driver's last known position.
export function TrackMap({ origin, destination, driver, color }: Props) {
  const pts = [origin, destination, driver].filter(ok);
  if (!pts.length) return null;
  const lats = pts.map((p) => p.lat); const lngs = pts.map((p) => p.lng);
  const region = {
    latitude: (Math.min(...lats) + Math.max(...lats)) / 2, longitude: (Math.min(...lngs) + Math.max(...lngs)) / 2,
    latitudeDelta: Math.max(0.01, (Math.max(...lats) - Math.min(...lats)) * 1.8), longitudeDelta: Math.max(0.01, (Math.max(...lngs) - Math.min(...lngs)) * 1.8),
  };
  return (
    <View style={styles.wrap} testID="track-map">
      <MapView style={StyleSheet.absoluteFill} region={region} userInterfaceStyle={getScheme()}>
        {ok(origin) ? <Marker coordinate={{ latitude: origin.lat, longitude: origin.lng }} pinColor={color} /> : null}
        {ok(destination) ? <Marker coordinate={{ latitude: destination.lat, longitude: destination.lng }} pinColor="#FFFFFF" /> : null}
        {ok(driver) ? <Marker coordinate={{ latitude: driver.lat, longitude: driver.lng }} pinColor="#F5A524" /> : null}
      </MapView>
    </View>
  );
}

const styles = themed(() => StyleSheet.create({
  wrap: { height: 220, borderRadius: 18, overflow: 'hidden', backgroundColor: colors.surface },
}));
