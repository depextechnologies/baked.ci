import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { ArrowRight, Sparkles } from 'lucide-react-native';
import React, { useEffect, useRef, useState } from 'react';
import { FlatList, StyleSheet, useWindowDimensions, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';

import { assetFor, nativeLink, pick } from '@/lib/cms';
import { useApp } from '@/state/AppContext';
import { AppText, OnDark } from '../ui/AppText';
import { Touchable } from '../ui/Button';
import type { SectionProps } from './types';
import { themed } from '@/theme';

// Website parity: 16/10 (phone) · 16/9 (tablet+) carousel, left gradient, eyebrow/badge/headline/description/CTAs, dots.
export function HeroCarousel({ section, accent, module, width }: SectionProps) {
  const { lang } = useApp();
  const { width: screen } = useWindowDimensions();
  const cfg = section.config || {};
  const slides: any[] = (Array.isArray(cfg.slides) && cfg.slides.length ? cfg.slides
    : [{ headline: section.title, headline_fr: cfg.title_fr, description: section.subtitle, description_fr: cfg.subtitle_fr, image: cfg.background_image, image_mobile: cfg.mobile_background_image, cta_label: cfg.cta_label, cta_label_fr: cfg.cta_label_fr, cta_link: cfg.cta_link }])
    .filter((s) => s && (s.headline || s.headline_fr || s.image));
  const [idx, setIdx] = useState(0);
  const list = useRef<FlatList>(null);
  const h = Math.round(width / (screen >= 768 ? 16 / 9 : 16 / 10));

  useEffect(() => {
    if (slides.length < 2) return;
    const t = setInterval(() => setIdx((i) => (i + 1) % slides.length), 5500);
    return () => clearInterval(t);
  }, [slides.length]);
  useEffect(() => { list.current?.scrollToOffset({ offset: idx * width, animated: true }); }, [idx, width]);

  if (!slides.length) return null;
  const onEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => setIdx(Math.round(e.nativeEvent.contentOffset.x / width));
  return (
    <View style={[styles.wrap, { height: h }]} testID={`cms-hero-${section.id}`}>
      <FlatList ref={list} data={slides} horizontal pagingEnabled showsHorizontalScrollIndicator={false} keyExtractor={(_, i) => String(i)}
        onMomentumScrollEnd={onEnd} getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
        renderItem={({ item: s, index: i }) => {
          const img = assetFor(s, screen);
          const eyebrow = pick(s, 'eyebrow', lang); const badge = pick(s, 'badge', lang); const cta = pick(s, 'cta_label', lang); const cta2 = pick(s, 'secondary_cta_label', lang);
          const desc = pick(s, 'description', lang);
          return (
            <View style={{ width, height: h }} testID={`cms-hero-slide-${i}`}><OnDark>
              {img ? <Image source={img} style={StyleSheet.absoluteFill} contentFit="cover" transition={250} cachePolicy="memory-disk" testID={`cms-hero-img-${i}`} /> : null}
              <LinearGradient colors={['rgba(0,0,0,0.85)', 'rgba(0,0,0,0.5)', 'rgba(0,0,0,0.05)']} locations={[0, 0.45, 1]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={StyleSheet.absoluteFill} />
              <View style={styles.body}>
                {eyebrow ? <View style={styles.row}><Sparkles color={accent} size={11} /><AppText size={10} weight="semibold" color={accent} style={styles.eyebrow}>{eyebrow}</AppText></View> : null}
                {badge ? <View style={[styles.badge, { backgroundColor: accent }]}><AppText size={10} weight="bold" color="#0a0a0a">{badge}</AppText></View> : null}
                <AppText weight="bold" size={screen >= 768 ? 34 : 21} style={{ lineHeight: screen >= 768 ? 40 : 26 }} numberOfLines={3} testID={`cms-hero-headline-${i}`}>{pick(s, 'headline', lang)}</AppText>
                {desc ? <AppText size={13} color="#D4D4D4" numberOfLines={2} style={{ marginTop: 8, maxWidth: 520 }}>{desc}</AppText> : null}
                <View style={[styles.row, { marginTop: 14, gap: 10 }]}>
                  {cta ? <Touchable testID={`cms-hero-cta-${i}`} onPress={() => router.push(nativeLink(s.cta_link, module) as any)} style={[styles.cta, { backgroundColor: accent }]}>
                    <AppText size={13} weight="semibold" color="#0a0a0a">{cta}</AppText><ArrowRight color="#0a0a0a" size={14} /></Touchable> : null}
                  {cta2 ? <Touchable testID={`cms-hero-cta2-${i}`} onPress={() => router.push(nativeLink(s.secondary_cta_link, module) as any)} style={[styles.cta, styles.cta2]}>
                    <AppText size={13} weight="semibold">{cta2}</AppText></Touchable> : null}
                </View>
              </View>
            </OnDark></View>
          );
        }} />
      {slides.length > 1 ? (
        <View style={styles.dots} testID="cms-hero-dots">
          {slides.map((_, i) => <View key={i} style={[styles.dot, i === idx ? { width: 24, backgroundColor: accent } : null]} />)}
        </View>
      ) : null}
    </View>
  );
}

const styles = themed(() => StyleSheet.create({
  wrap: { borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: '#262626', backgroundColor: '#0a0a0a' },
  body: { flex: 1, justifyContent: 'center', paddingHorizontal: 22, paddingTop: 16, paddingBottom: 30, maxWidth: 640 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  eyebrow: { letterSpacing: 1.6, textTransform: 'uppercase' },
  badge: { alignSelf: 'flex-start', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 4, marginTop: 8, marginBottom: 4 },
  cta: { height: 38, paddingHorizontal: 14, borderRadius: 12, flexDirection: 'row', alignItems: 'center', gap: 8 },
  cta2: { backgroundColor: 'rgba(255,255,255,0.1)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)' },
  dots: { position: 'absolute', bottom: 12, left: 0, right: 0, flexDirection: 'row', justifyContent: 'center', gap: 8 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.5)' },
}));
