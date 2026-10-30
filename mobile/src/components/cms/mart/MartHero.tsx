import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { ArrowRight, Bike, MapPin } from 'lucide-react-native';
import React from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';

import { assetFor, nativeLink, pick, sectionText } from '@/lib/cms';
import { formatMoney } from '@/lib/format';
import { useApp } from '@/state/AppContext';
import { colors, themed } from '@/theme';
import { AppText, OnDark } from '../../ui/AppText';
import { Touchable } from '../../ui/Button';
import type { SectionProps } from '../types';

const FALLBACK = 'https://images.unsplash.com/photo-1542838132-92c53300491e?w=1600&auto=format&fit=crop&q=70';
const money = (v: number | undefined, sym: string, lang: string) => (v == null ? '—' : formatMoney(v, undefined, sym, lang).replace(/[.,]00\b/, ''));

// Website ConfigHomepage hero: image card with MARTbakēd pill + CTAs, then the country delivery panel (stacked on phones).
export function MartHero({ section, accent, module }: SectionProps) {
  const { t, lang, country } = useApp();
  const { width: screen } = useWindowDimensions();
  const cfg = section.config || {};
  const img = assetFor({ image: cfg.background_image, image_mobile: cfg.mobile_background_image, image_tablet: cfg.background_image_tablet }, screen) || FALLBACK;
  const cta = pick(cfg, 'cta_label', lang); const cta2 = pick(cfg, 'secondary_cta_label', lang);
  const sub = sectionText(section, 'subtitle', lang);
  const sym = country?.currency_symbol || country?.currency || '';
  const eta = (country?.delivery_eta_min || '10-15 min').match(/(\d+\s*-\s*\d+|\d+)/)?.[1].replace(/\s+/g, '') || '10-15';
  const wide = screen >= 768;
  return (
    <View style={[styles.grid, wide && { flexDirection: 'row' }]} testID={`cms-mart-hero-${section.id}`}>
      <View style={[styles.hero, wide && { flex: 1.4, minHeight: 420 }]}><OnDark>
        <Image source={img} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="memory-disk" transition={250} testID="cms-mart-hero-img" />
        <LinearGradient colors={['rgba(0,0,0,0.85)', 'rgba(0,0,0,0.55)', 'rgba(0,0,0,0.15)']} locations={[0, 0.45, 1]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={StyleSheet.absoluteFill} />
        <View style={styles.body}>
          <View style={[styles.pill, { backgroundColor: 'rgba(119,188,31,0.25)', borderColor: 'rgba(119,188,31,0.5)' }]}>
            <View style={[styles.dot, { backgroundColor: accent }]} /><AppText size={11} weight="semibold" style={styles.caps}>MARTbakēd</AppText>
          </View>
          <AppText weight="bold" size={wide ? 44 : 28} style={{ lineHeight: wide ? 48 : 31 }} testID="cms-mart-hero-title">{sectionText(section, 'title', lang)}</AppText>
          {sub ? <AppText size={14} color="rgba(255,255,255,0.85)" style={{ marginTop: 10, maxWidth: 420 }}>{sub}</AppText> : null}
          <View style={styles.ctas}>
            {cta ? <Touchable testID="cms-mart-hero-cta" onPress={() => router.push(nativeLink(cfg.cta_link, module) as any)} style={[styles.btn, { backgroundColor: accent }]}>
              <AppText size={14} weight="bold">{cta}</AppText><ArrowRight color="#fff" size={16} /></Touchable> : null}
            {cta2 ? <Touchable testID="cms-mart-hero-cta2" onPress={() => router.push(nativeLink(cfg.secondary_cta_link, module) as any)} style={[styles.btn, styles.ghost]}>
              <AppText size={14} weight="bold">{cta2}</AppText></Touchable> : null}
          </View>
        </View>
      </OnDark></View>
      <View style={[styles.panel, wide && { flex: 0.9, justifyContent: 'flex-start', gap: 22 }]} testID="cms-mart-delivery-panel">
        <View>
          <AppText size={11} weight="semibold" color={colors.textMuted} style={styles.caps}>{t('cms.delivery_in')}</AppText>
          <View style={styles.etaRow}>
            <AppText weight="bold" size={40} testID="cms-mart-eta">{eta}</AppText>
            <AppText weight="semibold" size={16} color={colors.textMuted}>min</AppText>
            <View style={{ flex: 1 }} />
            <View style={styles.bike}><Bike color={accent} size={26} /></View>
          </View>
          <AppText size={12} color={colors.textMuted} style={{ marginTop: 8 }}>{t('cms.free_over', { amount: money(country?.free_delivery_over, sym, lang) })}</AppText>
        </View>
        <View style={[styles.split, { flexDirection: 'row' }]}>
          <View style={{ flex: 1 }}><AppText size={12} color={colors.textMuted}>{t('cms.delivery_fee')}</AppText><AppText size={14} weight="bold">{money(country?.delivery_fee, sym, lang)}</AppText></View>
          <View style={{ flex: 1 }}><AppText size={12} color={colors.textMuted}>{t('cms.min_order')}</AppText><AppText size={14} weight="bold">{money(country?.min_order, sym, lang)}</AppText></View>
        </View>
        <View style={[styles.split, { flexDirection: 'row', gap: 8 }]}>
          <MapPin color={accent} size={14} style={{ marginTop: 2 }} />
          <View><AppText size={12} color={colors.textMuted}>{t('cms.popular_near')}</AppText><AppText size={14} weight="semibold">{country?.name}</AppText></View>
        </View>
      </View>
    </View>
  );
}

const styles = themed(() => StyleSheet.create({
  grid: { gap: 16 },
  hero: { minHeight: 300, borderRadius: 24, overflow: 'hidden', justifyContent: 'flex-end', backgroundColor: '#0a0a0a' },
  body: { padding: 24, maxWidth: 560 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start', height: 28, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, marginBottom: 16 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  caps: { letterSpacing: 1.6, textTransform: 'uppercase' },
  ctas: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 22 },
  btn: { height: 48, paddingHorizontal: 22, borderRadius: 12, flexDirection: 'row', alignItems: 'center', gap: 8 },
  ghost: { backgroundColor: 'rgba(255,255,255,0.1)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)' },
  panel: { borderRadius: 24, padding: 24, gap: 16, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, justifyContent: 'space-between' },
  etaRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8, marginTop: 4 },
  bike: { width: 56, height: 56, borderRadius: 16, backgroundColor: 'rgba(119,188,31,0.15)', alignItems: 'center', justifyContent: 'center', alignSelf: 'center' },
  split: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 16 },
}));
