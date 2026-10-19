import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import MapView, { AnimatedRegion, Marker, MarkerAnimated, Polyline } from 'react-native-maps';

import type { LatLng } from '@/lib/routes';
import { colors } from '@/theme';

export type SendMapProps = { points: LatLng[]; route: LatLng[]; driver?: LatLng | null; color: string; height?: number | `${number}%` };

// Map stays visible through booking and tracking; the driver marker glides between WebSocket fixes.
export function SendMap({ points, route, driver, color, height = 300 }: SendMapProps) {
  const map = useRef<MapView>(null);
  const anim = useRef<any>(null);
  if (!anim.current && driver) anim.current = new AnimatedRegion({ ...driver, latitudeDelta: 0, longitudeDelta: 0 });

  useEffect(() => {
    if (!driver || !anim.current) return;
    anim.current.timing({ ...driver, latitudeDelta: 0, longitudeDelta: 0, duration: 1800, useNativeDriver: false }).start();
  }, [driver?.latitude, driver?.longitude]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const all = [...points, ...(driver ? [driver] : [])];
    if (all.length) map.current?.fitToCoordinates(all, { edgePadding: { top: 60, right: 50, bottom: 60, left: 50 }, animated: true });
  }, [points.length, route.length]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <View style={[styles.wrap, { height }]} testID="send-map">
      <MapView ref={map} style={StyleSheet.absoluteFill} userInterfaceStyle="dark"
        initialRegion={{ latitude: points[0]?.latitude ?? 5.3484, longitude: points[0]?.longitude ?? -4.0305, latitudeDelta: 0.08, longitudeDelta: 0.08 }}>
        {route.length > 1 ? <Polyline coordinates={route} strokeColor={color} strokeWidth={5} /> : null}
        {points.map((p, i) => <Marker key={`${i}-${p.latitude}`} coordinate={p} pinColor={i === 0 ? color : '#FFFFFF'} />)}
        {driver && anim.current ? (
          <MarkerAnimatedAny coordinate={anim.current}>
            <Animated.View style={[styles.driver, { borderColor: color }]} />
          </MarkerAnimatedAny>
        ) : null}
      </MapView>
    </View>
  );
}

const MarkerAnimatedAny = MarkerAnimated as any;

const styles = StyleSheet.create({
  wrap: { width: '100%', backgroundColor: colors.surface, overflow: 'hidden' },
  driver: { width: 22, height: 22, borderRadius: 11, backgroundColor: '#000', borderWidth: 5 },
});
