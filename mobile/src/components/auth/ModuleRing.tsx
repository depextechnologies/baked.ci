import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Platform, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

// The six module colours: bSHOP, bIMMO, bMART, bSEND, bAUTO, bFOOD.
const RING = ['#1D9BF0', '#A659FF', '#77BC1F', '#FCC44C', '#FF4C52', '#F26924'];

function Ring({ size, stroke }: { size: number; stroke: number }) {
  const r = size / 2 - stroke * 2;
  const c = 2 * Math.PI * r;
  const seg = c / RING.length;
  const gap = c * 0.014;
  const arcs = (w: number, o: number) => RING.map((col, i) => (
    <Circle key={`${w}-${col}`} cx={size / 2} cy={size / 2} r={r} fill="none" stroke={col} strokeWidth={w} strokeOpacity={o}
      strokeLinecap="round" strokeDasharray={`${seg - gap} ${c - seg + gap}`} strokeDashoffset={-i * seg} />
  ));
  return (
    <Svg width={size} height={size}>
      {arcs(stroke * 4, 0.12)}
      {arcs(stroke * 2, 0.22)}
      {arcs(stroke, 0.95)}
    </Svg>
  );
}

// Slowly rotating six-colour module ring, placed in a corner far from the logo.
export function ModuleRing({ size, period = 24000, reverse = false, style }: { size: number; period?: number; reverse?: boolean; style: object }) {
  const spin = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.timing(spin, { toValue: 1, duration: period, easing: Easing.linear, useNativeDriver: Platform.OS !== 'web' }));
    loop.start();
    return () => loop.stop();
  }, [spin, period]);
  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: reverse ? ['360deg', '0deg'] : ['0deg', '360deg'] });
  return (
    <View pointerEvents="none" style={[{ position: 'absolute', width: size, height: size }, style]}>
      <Animated.View style={{ width: size, height: size, transform: [{ rotate }] }}>
        <Ring size={size} stroke={Math.max(3, size / 110)} />
      </Animated.View>
    </View>
  );
}
