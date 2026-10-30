import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { ArrowRight, Tag } from 'lucide-react-native';
import React from 'react';
import { ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';

import { assetFor, nativeLink, pick, sectionText } from '@/lib/cms';
import { useApp } from '@/state/AppContext';
import { colors, hexA, themed } from '@/theme';
import { AppText, OnDark } from '../ui/AppText';
import { Touchable } from '../ui/Button';
import { SectionHeader } from './SectionHeader';
import type { SectionProps } from './types';

const DEEP = '#F59E0B';

export function PromoBanner({ section, accent, module }: SectionProps) {
  const { lang } = useApp();
  const { width: screen } = useWindowDimensions();
  const cfg = section.config || {};
  const img = assetFor(cfg, screen);
  const badge = pick(cfg, 'badge', lang); const cta = pick(cfg, 'cta_label', lang); const sub = sectionText(section, 'subtitle', lang);
  return (
    <View style={[styles.promo, { borderColor: hexA(accent, 0.33) }]} testID={`cms-promo-${section.id}`}><OnDark>
      {img ? <Image source={img} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="memory-disk" /> : null}
      <LinearGradient colors={img ? ['rgba(0,0,0,0.65)', 'rgba(0,0,0,0.15)', 'transparent'] : [hexA(DEEP, 0.14), '#0a0a0a']} start={{ x: 0, y: 0 }} end={{ x: 1, y: img ? 0 : 1 }} style={StyleSheet.absoluteFill} />
      {badge ? <View style={[styles.pill, { borderColor: hexA(accent, 0.4), backgroundColor: hexA(accent, 0.1) }]}><Tag color={accent} size={10} /><AppText size={10} weight="semibold" color={accent} style={{ letterSpacing: 1.4, textTransform: 'uppercase' }}>{badge}</AppText></View> : null}
      <AppText weight="bold" size={24} testID={`cms-promo-title-${section.id}`}>{sectionText(section, 'title', lang)}</AppText>
      {sub ? <AppText size={14} color="#D4D4D4" style={{ marginTop: 6 }}>{sub}</AppText> : null}
      {cta ? <Touchable testID={`cms-promo-cta-${section.id}`} onPress={() => router.push(nativeLink(cfg.link, module) as any)} style={[styles.cta, { backgroundColor: accent }]}>
        <AppText size={13} weight="semibold" color="#171717">{cta}</AppText><ArrowRight color="#171717" size={14} /></Touchable> : null}
    </OnDark></View>
  );
}

export function BannerTrio({ section, module }: SectionProps) {
  const { lang } = useApp();
  const { width: screen } = useWindowDimensions();
  const banners: any[] = section.config?.banners || [];
  if (!banners.length) return null;
  return (
    <View testID={`cms-banner-trio-${section.id}`}>
      <SectionHeader testID="cms-banner-trio" title={sectionText(section, 'title', lang)} subtitle={sectionText(section, 'subtitle', lang)} accent="#fff" />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 14 }}>
        {banners.map((b, i) => {
          const img = assetFor(b, screen);
          return (
            <Touchable key={i} testID={`cms-banner-tile-${i}`} onPress={() => router.push(nativeLink(b.link, module) as any)} style={styles.tile} scale={0.98}><OnDark>
              {img ? <Image source={img} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="memory-disk" /> : null}
              <LinearGradient colors={['rgba(0,0,0,0.1)', 'rgba(0,0,0,0.75)']} style={StyleSheet.absoluteFill} />
              {pick(b, 'eyebrow', lang) ? <AppText size={10} weight="bold" color="rgba(255,255,255,0.7)" style={{ letterSpacing: 1.4, textTransform: 'uppercase' }}>{pick(b, 'eyebrow', lang)}</AppText> : null}
              <AppText weight="bold" size={18}>{pick(b, 'label', lang)}</AppText>
              {pick(b, 'subtitle', lang) ? <AppText size={12} color="rgba(255,255,255,0.8)">{pick(b, 'subtitle', lang)}</AppText> : null}
            </OnDark></Touchable>
          );
        })}
      </ScrollView>
    </View>
  );
}

export function BrandRow({ section }: SectionProps) {
  const { lang } = useApp();
  const brands: any[] = section.config?.brands || [];
  if (!brands.length) return null;
  return (
    <View testID={`cms-brands-${section.id}`}>
      <AppText weight="semibold" size={20} style={{ marginBottom: 14 }}>{sectionText(section, 'title', lang)}</AppText>
      <View style={styles.wrap}>
        {brands.map((b, i) => (
          <View key={b.name || i} style={styles.brand} testID={`cms-brand-${i}`}>
            {b.image ? <Image source={assetFor(b, 0)} style={{ width: 16, height: 16 }} contentFit="contain" /> : null}
            <AppText size={12} color={colors.textMuted} style={{ letterSpacing: 1.4, textTransform: 'uppercase' }}>{b.name}</AppText>
          </View>
        ))}
      </View>
    </View>
  );
}

export function CtaStrip({ section, accent, module }: SectionProps) {
  const { lang } = useApp();
  const cfg = section.config || {};
  const cta = pick(cfg, 'cta_label', lang); const sub = sectionText(section, 'subtitle', lang);
  return (
    <LinearGradient colors={[accent, DEEP]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.strip}>
      <View testID={`cms-cta-strip-${section.id}`} style={{ alignItems: 'center' }}>
        <AppText weight="bold" size={24} color="#1a1300" align="center">{sectionText(section, 'title', lang)}</AppText>
        {sub ? <AppText size={14} color="#1a1300" align="center" style={{ marginTop: 6, opacity: 0.9 }}>{sub}</AppText> : null}
        {cta ? <Touchable testID={`cms-cta-strip-link-${section.id}`} onPress={() => router.push(nativeLink(cfg.cta_link, module) as any)} style={styles.black}><OnDark>
          <AppText size={14} weight="bold">{cta}</AppText><ArrowRight color="#fff" size={16} /></OnDark></Touchable> : null}
      </View>
    </LinearGradient>
  );
}

const styles = themed(() => StyleSheet.create({
  promo: { borderRadius: 16, borderWidth: 1, padding: 28, overflow: 'hidden', backgroundColor: '#0a0a0a' },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, marginBottom: 14 },
  cta: { marginTop: 22, alignSelf: 'flex-start', height: 44, paddingHorizontal: 20, borderRadius: 12, flexDirection: 'row', alignItems: 'center', gap: 8 },
  tile: { width: 300, minHeight: 240, borderRadius: 16, overflow: 'hidden', padding: 20, justifyContent: 'flex-end', gap: 4, backgroundColor: '#1a1a1a' },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 9, borderRadius: 999, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border },
  strip: { borderRadius: 24, padding: 32 },
  black: { marginTop: 22, height: 48, paddingHorizontal: 24, borderRadius: 12, backgroundColor: '#000', flexDirection: 'row', alignItems: 'center', gap: 8 },
}));
