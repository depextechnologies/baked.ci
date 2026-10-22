import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { ArrowRight, Bike, Package, RotateCcw, ShieldCheck, Smartphone, Tag, Truck, type LucideIcon } from 'lucide-react-native';
import React from 'react';
import { Linking, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';

import { absUrl, assetFor, nativeLink, pick, sectionText } from '@/lib/cms';
import { useApp } from '@/state/AppContext';
import { colors, hexA } from '@/theme';
import { AppText } from '../../ui/AppText';
import { Touchable } from '../../ui/Button';
import type { SectionProps } from '../types';
import { MartHeader } from './MartSections';

export function MartPromo({ section }: SectionProps) {
  const { lang } = useApp();
  const { width } = useWindowDimensions();
  const cfg = section.config || {};
  const img = assetFor(cfg, width);
  const badge = pick(cfg, 'badge', lang); const cta = pick(cfg, 'cta_label', lang); const sub = sectionText(section, 'subtitle', lang);
  return (
    <Touchable disabled={!cfg.link} onPress={() => router.push(nativeLink(cfg.link, 'mart') as any)} scale={0.99} testID={`cms-mart-promo-${section.id}`} style={[styles.promo, { minHeight: width >= 768 ? 260 : 180 }]}>
      {img ? <Image source={img} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="memory-disk" /> : null}
      <LinearGradient colors={img ? ['rgba(0,0,0,0.65)', 'rgba(0,0,0,0.15)', 'transparent'] : ['#77BC1F', '#3b6b0f']} start={{ x: 0, y: 0 }} end={{ x: 1, y: img ? 0 : 1 }} style={StyleSheet.absoluteFill} />
      <View style={{ padding: 24, maxWidth: 560 }}>
        {badge ? <View style={styles.badge}><AppText size={11} weight="bold" style={[styles.caps, { marginBottom: 0 }]}>{badge}</AppText></View> : null}
        <AppText weight="bold" size={width >= 768 ? 36 : 24} testID={`cms-mart-promo-title-${section.id}`}>{sectionText(section, 'title', lang)}</AppText>
        {sub ? <AppText size={14} color="rgba(255,255,255,0.85)" style={{ marginTop: 6 }}>{sub}</AppText> : null}
        {cta ? <View style={styles.white}><AppText size={14} weight="bold" color="#000">{cta}</AppText><ArrowRight color="#000" size={16} /></View> : null}
      </View>
    </Touchable>
  );
}

export function MartBannerRow({ section }: SectionProps) {
  const { lang } = useApp();
  const { width } = useWindowDimensions();
  const banners: any[] = section.config?.banners || [];
  if (!banners.length) return null;
  return (
    <View testID={`cms-mart-banners-${section.id}`}>
      <MartHeader testID="cms-mart-banners" title={sectionText(section, 'title', lang)} subtitle={sectionText(section, 'subtitle', lang)} accent="#77BC1F" />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 16 }}>
        {banners.map((b, i) => {
          const img = assetFor(b, width);
          return (
            <Touchable key={i} testID={`cms-mart-banner-${i}`} onPress={() => router.push(nativeLink(b.link, 'mart') as any)} style={styles.tile} scale={0.98}>
              {img ? <Image source={img} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="memory-disk" /> : null}
              <LinearGradient colors={img ? ['rgba(0,0,0,0.1)', 'rgba(0,0,0,0.75)'] : ['#262626', '#0a0a0a']} style={StyleSheet.absoluteFill} />
              {pick(b, 'eyebrow', lang) ? <AppText size={10} weight="bold" color="rgba(255,255,255,0.7)" style={styles.caps}>{pick(b, 'eyebrow', lang)}</AppText> : null}
              <AppText weight="bold" size={19}>{pick(b, 'label', lang)}</AppText>
              {pick(b, 'subtitle', lang) ? <AppText size={12} color="rgba(255,255,255,0.8)">{pick(b, 'subtitle', lang)}</AppText> : null}
            </Touchable>
          );
        })}
      </ScrollView>
    </View>
  );
}

export function MartBrands({ section, accent }: SectionProps) {
  const { t, lang } = useApp();
  const brands: any[] = section.config?.brands || [];
  return (
    <View testID={`cms-mart-brands-${section.id}`}>
      <MartHeader testID="cms-mart-brands" eyebrow={pick(section.config, 'eyebrow', lang) || t('cms.brands_eyebrow')} title={sectionText(section, 'title', lang)} subtitle={sectionText(section, 'subtitle', lang)} accent={accent} />
      <View style={styles.box}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 24, alignItems: 'center' }}>
          {brands.map((b, i) => (
            <View key={i} style={styles.brand} testID={`cms-mart-brand-${i}`}>
              {b.image ? <Image source={absUrl(b.image)} style={{ width: '100%', height: 40 }} contentFit="contain" /> : <AppText size={12} weight="bold" color="#D4D4D4" style={styles.caps}>{b.name}</AppText>}
            </View>
          ))}
        </ScrollView>
      </View>
    </View>
  );
}

export function MartAppPromo({ section }: SectionProps) {
  const { t, lang } = useApp();
  const { width } = useWindowDimensions();
  const cfg = section.config || {};
  const wide = width >= 768;
  const store = (url: string, top: string, name: string, id: string) => (
    <Touchable testID={id} onPress={() => Linking.openURL(url)} style={styles.store}>
      <Smartphone color="#fff" size={18} />
      <View><AppText size={10} color="rgba(255,255,255,0.7)">{top}</AppText><AppText size={14} weight="bold">{name}</AppText></View>
    </Touchable>
  );
  return (
    <LinearGradient colors={['#0f2a05', '#1a4d0a', '#2b7a15']} locations={[0, 0.6, 1]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0.4 }} style={[styles.app, wide && { flexDirection: 'row', alignItems: 'center' }]}>
      <View style={{ flex: 1.2 }} testID={`cms-mart-app-${section.id}`}>
        {cfg.logo ? <Image source={absUrl(cfg.logo)} style={styles.logo} /> : null}
        <AppText size={11} weight="bold" color="#c9f086" style={styles.caps}>{pick(cfg, 'eyebrow', lang) || t('cms.get_app')}</AppText>
        <AppText weight="bold" size={wide ? 36 : 24} testID="cms-mart-app-title">{sectionText(section, 'title', lang)}</AppText>
        {sectionText(section, 'subtitle', lang) ? <AppText size={14} color="rgba(255,255,255,0.85)" style={{ marginTop: 10 }}>{sectionText(section, 'subtitle', lang)}</AppText> : null}
        <View style={styles.stores}>
          {cfg.google_play_url ? store(cfg.google_play_url, t('cms.get_it_on'), 'Google Play', 'cms-mart-google-play') : null}
          {cfg.app_store_url ? store(cfg.app_store_url, t('cms.download_on'), 'App Store', 'cms-mart-app-store') : null}
        </View>
        {cfg.qr_target ? (
          <View style={styles.qrRow}>
            <Image source={`https://api.qrserver.com/v1/create-qr-code/?size=110x110&data=${encodeURIComponent(cfg.qr_target)}`} style={styles.qr} testID="cms-mart-qr" />
            <AppText size={12} color="rgba(255,255,255,0.8)" style={{ maxWidth: 170 }}>{t('cms.scan')}</AppText>
          </View>
        ) : null}
      </View>
      {wide ? (
        <View style={{ flex: 0.9, alignItems: 'center' }}>
          {cfg.phone_screenshot ? <Image source={absUrl(cfg.phone_screenshot)} style={{ width: 220, height: 440, borderRadius: 36 }} contentFit="contain" />
            : <View style={styles.phone}><Package color="#77BC1F" size={72} /></View>}
        </View>
      ) : null}
    </LinearGradient>
  );
}

export function MartCtaStrip({ section }: SectionProps) {
  const { lang } = useApp();
  const cfg = section.config || {};
  const cta = pick(cfg, 'cta_label', lang); const sub = sectionText(section, 'subtitle', lang);
  return (
    <LinearGradient colors={['#77BC1F', '#4a7d0a']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.strip}>
      <View style={{ alignItems: 'center' }} testID={`cms-mart-cta-${section.id}`}>
        <AppText weight="bold" size={24} color="#0a1200" align="center">{sectionText(section, 'title', lang)}</AppText>
        {sub ? <AppText size={14} color="#0a1200" align="center" style={{ marginTop: 6, opacity: 0.9 }}>{sub}</AppText> : null}
        {cta ? <Touchable testID={`cms-mart-cta-link-${section.id}`} onPress={() => router.push(nativeLink(cfg.cta_link, 'mart') as any)} style={styles.black}>
          <AppText size={14} weight="bold">{cta}</AppText><ArrowRight color="#fff" size={16} /></Touchable> : null}
      </View>
    </LinearGradient>
  );
}

const TRUST_ICONS: Record<string, LucideIcon> = { bike: Bike, package: Package, tag: Tag, rotate: RotateCcw, shield: ShieldCheck, truck: Truck };

export function MartTrust({ section }: SectionProps) {
  const { lang } = useApp();
  const { width } = useWindowDimensions();
  const items: any[] = section.config?.items || [];
  if (!items.length) return null;
  return (
    <View style={styles.trust} testID={`cms-mart-trust-${section.id}`}>
      {items.map((it, i) => {
        const Icon = TRUST_ICONS[it.icon] || Package; const c = it.color || '#77BC1F';
        return (
          <View key={i} style={[styles.trustItem, { width: width >= 768 ? '25%' : '50%' }]} testID={`cms-mart-trust-${i}`}>
            <View style={[styles.trustIcon, { backgroundColor: hexA(c, 0.13) }]}><Icon color={c} size={20} /></View>
            <View style={{ flex: 1 }}><AppText size={13} weight="bold">{pick(it, 'title', lang)}</AppText><AppText size={11} color={colors.textMuted}>{pick(it, 'subtitle', lang)}</AppText></View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  caps: { letterSpacing: 1.8, textTransform: 'uppercase', marginBottom: 6 },
  promo: { borderRadius: 24, overflow: 'hidden', justifyContent: 'center', backgroundColor: '#3b6b0f' },
  badge: { alignSelf: 'flex-start', height: 24, justifyContent: 'center', paddingHorizontal: 12, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.2)', marginBottom: 12 },
  white: { marginTop: 20, alignSelf: 'flex-start', height: 44, paddingHorizontal: 20, borderRadius: 12, backgroundColor: '#fff', flexDirection: 'row', alignItems: 'center', gap: 8 },
  tile: { width: 320, maxWidth: 320, minHeight: 258, borderRadius: 16, overflow: 'hidden', padding: 20, justifyContent: 'flex-end', gap: 2 },
  box: { borderRadius: 16, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: 20 },
  brand: { height: 64, width: 112, alignItems: 'center', justifyContent: 'center', opacity: 0.75 },
  app: { borderRadius: 24, padding: 24, gap: 24, overflow: 'hidden' },
  logo: { width: 64, height: 64, borderRadius: 16, marginBottom: 16 },
  stores: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 22 },
  store: { height: 48, paddingHorizontal: 18, borderRadius: 12, backgroundColor: '#000', borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)', flexDirection: 'row', alignItems: 'center', gap: 12 },
  qrRow: { flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: 22 },
  qr: { width: 110, height: 110, borderRadius: 8, backgroundColor: '#fff', padding: 8 },
  phone: { width: 224, height: 384, borderRadius: 40, backgroundColor: 'rgba(0,0,0,0.4)', borderWidth: 4, borderColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center' },
  strip: { borderRadius: 24, padding: 32 },
  black: { marginTop: 22, height: 48, paddingHorizontal: 24, borderRadius: 12, backgroundColor: '#000', flexDirection: 'row', alignItems: 'center', gap: 8 },
  trust: { flexDirection: 'row', flexWrap: 'wrap', borderRadius: 16, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: 14 },
  trustItem: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, padding: 6 },
  trustIcon: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
});
