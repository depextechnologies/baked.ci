import AsyncStorage from '@react-native-async-storage/async-storage';
import { Image } from 'expo-image';
import * as SplashScreen from 'expo-splash-screen';
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';

import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';

import { AppText } from './ui/AppText';

const INTRO_KEY = 'baked.intro_seen';
const BADGE = require('../../assets/images/brand/intro-badge.png');
const WORD = require('../../assets/images/brand/intro-word.png');
const B = 72; // badge size; wordmark proportions follow the official logo
const WORD_H = B * (272 / 448);

// Launch overlay on the native splash's black: first launch plays the 'b' slide-in + wordmark + glow (~2s), later launches fade quickly.
export function SplashOverlay({ ready, tagline }: { ready: boolean; tagline: string }) {
  const [first, setFirst] = useState<boolean | null>(null);
  const [done, setDone] = useState(false);
  const [gone, setGone] = useState(false);
  const badge = useRef(new Animated.Value(0)).current;
  const word = useRef(new Animated.Value(0)).current;
  const glow = useRef(new Animated.Value(0)).current;
  const fade = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    AsyncStorage.getItem(INTRO_KEY).then((v) => setFirst(!v)).catch(() => setFirst(false));
  }, []);

  useEffect(() => {
    if (first === null) return;
    SplashScreen.hideAsync().catch(() => {});
    const ease = Easing.out(Easing.cubic);
    if (!first) {
      badge.setValue(1); word.setValue(1);
      const id = setTimeout(() => setDone(true), 600);
      return () => clearTimeout(id);
    }
    AsyncStorage.setItem(INTRO_KEY, '1').catch(() => {});
    Animated.sequence([
      Animated.timing(badge, { toValue: 1, duration: 650, easing: ease, useNativeDriver: true }),
      Animated.timing(word, { toValue: 1, duration: 550, easing: ease, useNativeDriver: true }),
      Animated.sequence([
        Animated.timing(glow, { toValue: 1, duration: 400, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(glow, { toValue: 0.35, duration: 450, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    ]).start(() => setDone(true));
  }, [first, badge, word, glow]);

  useEffect(() => {
    if (ready && done) Animated.timing(fade, { toValue: 0, duration: 380, useNativeDriver: true }).start(() => setGone(true));
  }, [ready, done, fade]);

  if (gone) return null;
  const badgeX = badge.interpolate({ inputRange: [0, 1], outputRange: [-90, 0] });
  const wordX = word.interpolate({ inputRange: [0, 1], outputRange: [-14, 0] });
  const glowScale = glow.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1.15] });
  return (
    <Animated.View testID="splash-overlay" pointerEvents={ready && done ? 'none' : 'auto'} style={[StyleSheet.absoluteFill, styles.wrap, { opacity: fade }]}>
      <View style={styles.center}>
        <Animated.View pointerEvents="none" style={[styles.glow, { opacity: glow, transform: [{ scale: glowScale }] }]} testID="splash-glow">
          <Svg width={360} height={360}>
            <Defs>
              <RadialGradient id="g" cx="50%" cy="50%" r="50%">
                <Stop offset="0" stopColor="#fff" stopOpacity={0.28} />
                <Stop offset="0.55" stopColor="#fff" stopOpacity={0.08} />
                <Stop offset="1" stopColor="#fff" stopOpacity={0} />
              </RadialGradient>
            </Defs>
            <Circle cx={180} cy={180} r={180} fill="url(#g)" />
          </Svg>
        </Animated.View>
        <View style={styles.row}>
          <Animated.View style={{ opacity: badge, transform: [{ translateX: badgeX }] }}>
            <Image source={BADGE} style={{ width: B, height: B }} contentFit="contain" testID="splash-badge" />
          </Animated.View>
          <Animated.View style={{ opacity: word, transform: [{ translateX: wordX }] }}>
            <Image source={WORD} style={{ height: WORD_H, width: WORD_H * (1024 / 272) }} contentFit="contain" accessibilityLabel="baked" testID="splash-wordmark" />
          </Animated.View>
        </View>
        <Animated.View style={{ opacity: word, marginTop: 20 }}>
          <AppText size={13} color="rgba(255,255,255,0.6)" align="center" testID="splash-tagline">{tagline}</AppText>
        </Animated.View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { backgroundColor: '#000', alignItems: 'center', justifyContent: 'center', zIndex: 100 },
  center: { alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: B * (126 / 448) },
  glow: { position: 'absolute', width: 360, height: 360 },
});
