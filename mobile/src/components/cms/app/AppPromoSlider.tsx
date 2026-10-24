import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { ChevronRight } from 'lucide-react-native';
import React, { useState } from 'react';
import { ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';

import { useModuleNav } from '@/hooks/useModuleNav';
import { absUrl, nativeLink } from '@/lib/cms';
import type { ModuleCode } from '@/lib/modules';
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
  const items: any[] = (section.config?.items || []).filter((b: any) => b.enabled !== false && (b.title_fr || b.title_en || b.image));
  if (!items.length) return null;
  const cardW = Math.min(width, 520) * 0.8;
  const go = (link?: string) => {
    const l = (link || '').replace(/\/$/, '');
    if (MODULE_LINKS[l]) openModule(MODULE_LINKS[l]);
    else if (l) router.push(nativeLink(l, 'baked') as any);
  };
  return (
    <View testID="app-promo-slider">
      <ScrollView horizontal showsHorizontalScrollIndicator={false} snapToInterval={cardW + 10} decelerationRate="fast" contentContainerStyle={styles.rail}
        onScroll={(e) => setIdx(Math.round(e.nativeEvent.contentOffset.x / (cardW + 10)))} scrollEventThrottle={32}>
        {items.map((b, i) => {
          const accent = b.accent || colors.accent;
          const title = (lang === 'en' ? b.title_en : b.title_fr) || b.title_fr || b.title_en;
          const cta = (lang === 'en' ? b.cta_label_en : b.cta_label_fr) || b.cta_label_fr || b.cta_label_en;
          return (
            <Touchable key={i} testID={`app-promo-${i}`} onPress={() => go(b.link)} scale={0.98} style={[styles.card, { width: cardW, borderColor: hexA(accent, 0.6) }]}>
              {b.image ? <Image source={absUrl(b.image)} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} /> : null}
              <LinearGradient colors={['rgba(0,0,0,0.85)', 'rgba(0,0,0,0.35)', 'transparent']} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={StyleSheet.absoluteFill} />
              <View style={styles.body}>
                <AppText weight="black" size={18} color="#fff" numberOfLines={3} style={{ lineHeight: 21 }} testID={`app-promo-${i}-title`}>{title}</AppText>
                {cta ? (
                  <View style={[styles.cta, { backgroundColor: accent }]}>
                    <AppText weight="bold" size={12} color="#000">{cta}</AppText><ChevronRight color="#000" size={14} strokeWidth={2.6} />
                  </View>
                ) : null}
              </View>
            </Touchable>
          );
        })}
      </ScrollView>
      {items.length > 1 ? (
        <View style={styles.dots} testID="app-promo-dots">
          {items.map((_, i) => <View key={i} style={[styles.dot, i === idx && styles.dotOn]} />)}
        </View>
      ) : null}
    </View>
  );
}

const styles = themed(() => StyleSheet.create({
  rail: { paddingHorizontal: 14, gap: 10 },
  card: { height: 132, borderRadius: 16, borderWidth: 1.2, overflow: 'hidden', backgroundColor: '#111' },
  body: { flex: 1, width: '56%', padding: 14, justifyContent: 'space-between' },
  cta: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 4, height: 30, paddingHorizontal: 14, borderRadius: 999 },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: 10 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.muted },
  dotOn: { backgroundColor: colors.text, width: 16 },
}));
