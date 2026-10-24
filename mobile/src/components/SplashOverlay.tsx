import * as SplashScreen from 'expo-splash-screen';
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet } from 'react-native';

import { colors, themed } from '@/theme';
import { Logo } from './Logo';
import { AppText } from './ui/AppText';

const MIN_MS = 1100;

// In-app continuation of the native splash: logo breathes in, then the overlay fades once the app is ready.
export function SplashOverlay({ ready, tagline }: { ready: boolean; tagline: string }) {
  const [gone, setGone] = useState(false);
  const [minElapsed, setMinElapsed] = useState(false);
  const logo = useRef(new Animated.Value(0)).current;
  const fade = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    SplashScreen.hideAsync().catch(() => {});
    Animated.timing(logo, { toValue: 1, duration: 700, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    const id = setTimeout(() => setMinElapsed(true), MIN_MS);
    return () => clearTimeout(id);
  }, [logo]);

  useEffect(() => {
    if (ready && minElapsed) {
      Animated.timing(fade, { toValue: 0, duration: 320, useNativeDriver: true }).start(() => setGone(true));
    }
  }, [ready, minElapsed, fade]);

  if (gone) return null;
  const scale = logo.interpolate({ inputRange: [0, 1], outputRange: [0.86, 1] });
  return (
    <Animated.View testID="splash-overlay" pointerEvents={ready && minElapsed ? 'none' : 'auto'} style={[StyleSheet.absoluteFill, styles.wrap, { opacity: fade }]}>
      <Animated.View style={{ opacity: logo, transform: [{ scale }], alignItems: 'center', gap: 18 }}>
        <Logo height={64} />
        <AppText size={13} color={colors.textMuted} align="center">{tagline}</AppText>
      </Animated.View>
    </Animated.View>
  );
}

const styles = themed(() => StyleSheet.create({
  wrap: { backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', zIndex: 100 },
}));
