import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path } from 'react-native-svg';
import { router } from 'expo-router';
import { ChevronRight } from 'lucide-react-native';
import React, { useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, View, useWindowDimensions, type ScrollViewInstance } from 'react-native';

import { useModuleNav } from '@/hooks/useModuleNav';
import { absUrl, nativeLink } from '@/lib/cms';
import { MODULES, type ModuleCode } from '@/lib/modules';
import { ModuleIcon } from '../../ModuleIcon';
import { SafeImage } from '../../ui/SafeImage';
import { useApp } from '@/state/AppContext';
import { colors, hexA, themed } from '@/theme';
import { AppText } from '../../ui/AppText';
import { Touchable } from '../../ui/Button';
import type { SectionProps } from '../types';

const MODULE_LINKS: Record<string, ModuleCode> = { '/send': 'express', '/express': 'express', '/food': 'food', '/mart': 'mart', '/shop': 'shop' };

// Promo banner slider (Super Admin managed). Text sits on the artwork, so it stays white in both themes.
export function AppPromoSlider({ section }: SectionProps) {
  const { lang } = useApp();
  const { openModule } = useModuleNav();
  const { width } = useWindowDimensions();
  const [idx, setIdx] = useState(0);
  const rail = useRef<ScrollViewInstance>(null);
  const items: any[] = (section.config?.items || []).filter((b: any) => b.enabled !== false && (b.title_fr || b.title_en || b.image));
  const cardW = width - 28;
  useEffect(() => {
    if (items.length < 2) return;
    const id = setInterval(() => setIdx((i) => {
      const n = (i + 1) % items.length;
      rail.current?.scrollTo({ x: n * (cardW + 28), animated: true });
      return n;
    }), 4000);
    return () => clearInterval(id);
  }, [items.length, cardW]);
  if (!items.length) return null;
  const go = (link?: string) => {
    const l = (link || '').replace(/\/$/, '');
    if (MODULE_LINKS[l]) openModule(MODULE_LINKS[l]);
    else if (l) router.push(nativeLink(l, 'baked') as any);
  };
  return (
    <View testID="app-promo-slider">
      <ScrollView ref={rail} horizontal showsHorizontalScrollIndicator={false} snapToInterval={cardW + 28} decelerationRate="fast" contentContainerStyle={styles.rail}
        onScroll={(e) => setIdx(Math.round(e.nativeEvent.contentOffset.x / (cardW + 28)))} scrollEventThrottle={32}>
        {items.map((b, i) => {
          const accent = b.accent || colors.accent;
          const title = (lang === 'en' ? b.title_en : b.title_fr) || b.title_fr || b.title_en;
          const cta = (lang === 'en' ? b.cta_label_en : b.cta_label_fr) || b.cta_label_fr || b.cta_label_en;
          return (
            <Touchable key={i} testID={`app-promo-${i}`} onPress={() => go(b.link)} scale={0.98} style={[styles.card, { width: cardW, marginHorizontal: 14 }]}>
              <SafeImage source={absUrl(b.image)} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} fallback={<PromoArt link={b.link} accent={accent} testID={`app-promo-${i}-fallback`} />} />
              <LinearGradient colors={['rgba(0,0,0,0.85)', 'rgba(0,0,0,0.35)', 'transparent']} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={StyleSheet.absoluteFill} />
              <View style={styles.body}>
                <AppText weight="black" size={21} color="#fff" numberOfLines={3} style={{ lineHeight: 25 }} testID={`app-promo-${i}-title`}>{title}</AppText>
                {cta ? (
                  <View style={[styles.cta, { backgroundColor: accent }]}>
                    <AppText weight="bold" size={12} color="#000">{cta}</AppText><ChevronRight color="#000" size={14} strokeWidth={2.6} />
                  </View>
                ) : null}
              </View>
              <Svg width={cardW} height={44} viewBox="0 0 100 44" preserveAspectRatio="none" style={styles.curve} testID={`app-promo-${i}-curve`}>
                <Path d="M0 44 L0 34 Q50 46 100 6 L100 44 Z" fill={colors.bg} />
                <Path d="M0 34 Q50 46 100 6" stroke={accent} strokeWidth={2.2} fill="none" vectorEffect="non-scaling-stroke" />
              </Svg>
            </Touchable>
          );
        })}
      </ScrollView>
    </View>
  );
}

// Branded artwork shown when a banner image is missing or fails to load (same card size).
function PromoArt({ link, accent, testID }: { link?: string; accent: string; testID: string }) {
  const mod = MODULE_LINKS[(link || '').replace(/\/$/, '')];
  return (
    <View style={StyleSheet.absoluteFill} testID={testID}>
      <LinearGradient colors={[hexA(accent, 0.15), hexA(accent, 0.55)]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      {mod ? <View style={styles.art}><ModuleIcon icon={MODULES[mod].icon} color={accent} size={56} /></View> : null}
    </View>
  );
}

const styles = themed(() => StyleSheet.create({
  rail: {},
  art: { position: 'absolute', right: 22, top: 0, bottom: 0, justifyContent: 'center', opacity: 0.9 },
  card: { height: 168, borderRadius: 20, overflow: 'hidden', backgroundColor: '#111' },
  curve: { position: 'absolute', left: 0, bottom: -1 },
  body: { width: '58%', padding: 16, paddingBottom: 0, gap: 14 },
  cta: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 4, height: 30, paddingHorizontal: 14, borderRadius: 999 },
}));
