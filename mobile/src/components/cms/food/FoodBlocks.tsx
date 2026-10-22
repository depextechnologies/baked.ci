import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { ChevronRight, Clock, Heart, Shield, ShoppingBag, Sparkles, Star, Tag, Truck, Utensils, type LucideIcon } from 'lucide-react-native';
import React, { useState } from 'react';
import { ScrollView, StyleSheet, useWindowDimensions, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';

import { absUrl, nativeLink } from '@/lib/cms';
import { useApp } from '@/state/AppContext';
import { colors, hexA } from '@/theme';
import { AppText } from '../../ui/AppText';
import { Touchable } from '../../ui/Button';
import type { SectionProps } from '../types';
import { bi, biItem } from './FoodData';
import { FoodHead } from './FoodSections';

const G = '#77BC1F';
const ICONS: Record<string, LucideIcon> = { shield: Shield, truck: Truck, sparkles: Sparkles, tag: Tag, clock: Clock, utensils: Utensils, star: Star, heart: Heart, shopping: ShoppingBag };

export function FoodPromos({ section }: SectionProps) {
  const { lang } = useApp();
  const { width } = useWindowDimensions();
  const banners: any[] = section.config?.banners || [];
  if (!banners.length) return null;
  return (
    <View testID={`cms-food-promos-${section.id}`} style={[{ gap: 16 }, width >= 768 && { flexDirection: 'row' }]}>
      {banners.map((b, i) => {
        const img = absUrl(b.image); const cta = biItem(b, 'cta_label', lang); const desc = biItem(b, 'description', lang);
        return (
          <View key={i} style={[styles.promo, width >= 768 && { flex: 1 }]} testID={`food-promo-${section.id}-${i}`}>
            {img ? <Image source={img} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="memory-disk" /> : null}
            <LinearGradient colors={['rgba(0,0,0,0.8)', 'rgba(0,0,0,0.35)']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={StyleSheet.absoluteFill} />
            <View style={{ padding: 24, maxWidth: 420 }}>
              <AppText weight="bold" size={21}>{biItem(b, 'headline', lang)}</AppText>
              {desc ? <AppText size={12} color="rgba(255,255,255,0.8)" style={{ marginTop: 8 }}>{desc}</AppText> : null}
              {cta ? <Touchable testID={`food-promo-cta-${i}`} onPress={() => router.push(nativeLink(b.cta_link, 'food') as any)} style={styles.cta}>
                <AppText size={12} weight="semibold" color="#000">{cta}</AppText><ChevronRight color="#000" size={14} /></Touchable> : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}

export function FoodUsps({ section }: SectionProps) {
  const { lang } = useApp();
  const { width } = useWindowDimensions();
  const usps: any[] = section.config?.usps || [];
  const cols = width >= 1024 ? 4 : width >= 768 ? 2 : 1;
  return (
    <View testID={`cms-food-usps-${section.id}`}>
      <AppText weight="bold" size={20} style={{ marginBottom: 14 }}>{bi(section, 'title', lang)}</AppText>
      <View style={styles.wrap}>
        {usps.map((u, i) => {
          const Icon = ICONS[(u.icon || 'star').toLowerCase()] || Star;
          return (
            <View key={i} style={{ width: `${100 / cols}%`, padding: 6 }}>
              <View style={styles.usp} testID={`food-usp-${i}`}>
                <View style={styles.uspIcon}><Icon color={G} size={18} /></View>
                <View style={{ flex: 1 }}><AppText size={14} weight="semibold">{biItem(u, 'title', lang)}</AppText><AppText size={11} color={colors.textMuted}>{biItem(u, 'subtitle', lang)}</AppText></View>
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}

export function FoodTestimonial({ section }: SectionProps) {
  const { lang } = useApp();
  const { width } = useWindowDimensions();
  const [idx, setIdx] = useState(0);
  const cfg = section.config || {};
  let items: any[] = (cfg.items || []).filter((it: any) => it.enabled !== false && (it.quote_fr || it.quote_en || it.quote)).sort((a: any, b: any) => (a.sort_order || 0) - (b.sort_order || 0));
  if (!items.length && (cfg.quote_fr || cfg.quote_en || cfg.quote)) items = [cfg];
  if (!items.length) return null;
  const cardW = width >= 768 ? (width - 48) / 2 : width - 32;
  const onEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => setIdx(Math.round(e.nativeEvent.contentOffset.x / (cardW + 16)));
  return (
    <View testID={`cms-food-testimonial-${section.id}`}>
      <FoodHead testID="cms-food-testimonial" title={bi(section, 'title', lang)} subtitle={bi(section, 'subtitle', lang)} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} snapToInterval={cardW + 16} decelerationRate="fast" onMomentumScrollEnd={onEnd} contentContainerStyle={{ gap: 16 }}>
        {items.map((it, i) => {
          const author = biItem(it, 'author', lang); const photo = absUrl(it.customer_image); const bg = absUrl(it.background_image);
          return (
            <View key={i} style={[styles.quote, { width: cardW }]} testID={`food-testimonial-card-${i}`}>
              {bg ? <Image source={bg} style={StyleSheet.absoluteFill} contentFit="cover" /> : null}
              {bg ? <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.78)' }]} /> : null}
              <AppText size={64} color={hexA(G, 0.3)} style={styles.mark}>“</AppText>
              <AppText size={14} style={{ lineHeight: 22, paddingTop: 22 }}>{biItem(it, 'quote', lang)}</AppText>
              <View style={styles.author}>
                {photo ? <Image source={photo} style={styles.avatar} /> : <View style={[styles.avatar, { backgroundColor: G, alignItems: 'center', justifyContent: 'center' }]}><AppText weight="bold" color="#000">{(author || '?').trim()[0]?.toUpperCase()}</AppText></View>}
                <View style={{ flex: 1 }}>
                  <AppText size={13} weight="semibold" numberOfLines={1}>{author || (lang === 'fr' ? 'Client vérifié' : 'Verified customer')}</AppText>
                  {biItem(it, 'role', lang) ? <AppText size={11} color="rgba(255,255,255,0.6)">{biItem(it, 'role', lang)}</AppText> : null}
                </View>
                <View style={{ flexDirection: 'row' }}>{[0, 1, 2, 3, 4].map((s) => <Star key={s} color={G} fill={G} size={13} />)}</View>
              </View>
            </View>
          );
        })}
      </ScrollView>
      {items.length > 1 && width < 768 ? <View style={styles.dots}>{items.map((_, i) => <View key={i} style={[styles.dot, i === idx && { width: 20, backgroundColor: G }]} />)}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  promo: { minHeight: 160, borderRadius: 16, overflow: 'hidden', justifyContent: 'center', backgroundColor: '#0d0d0d' },
  cta: { marginTop: 16, alignSelf: 'flex-start', height: 40, paddingHorizontal: 16, borderRadius: 999, backgroundColor: G, flexDirection: 'row', alignItems: 'center', gap: 8 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -6 },
  usp: { flexDirection: 'row', gap: 12, padding: 16, borderRadius: 16, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  uspIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: hexA(G, 0.13), alignItems: 'center', justifyContent: 'center' },
  quote: { minHeight: 220, borderRadius: 24, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', backgroundColor: '#0a0a0a', padding: 24, justifyContent: 'space-between' },
  mark: { position: 'absolute', top: -6, left: 20, fontFamily: 'serif' },
  author: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 18, paddingTop: 18, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.1)' },
  avatar: { width: 40, height: 40, borderRadius: 20 },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: 12 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.3)' },
});
