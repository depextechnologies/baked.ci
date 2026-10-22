import { Image } from 'expo-image';
import { router } from 'expo-router';
import { ArrowRight, Plus, Search, Sparkles } from 'lucide-react-native';
import React from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';

import { absUrl } from '@/lib/cms';
import { WEB_ORIGIN } from '@/lib/config';
import { useApp } from '@/state/AppContext';
import { colors, hexA, radius } from '@/theme';
import { SendMap } from '../../send/SendMap';
import { AppText } from '../../ui/AppText';
import { Touchable } from '../../ui/Button';
import type { SectionProps } from '../types';

const Y = '#FCC44C';
const CENTER: Record<string, { latitude: number; longitude: number }> = { CI: { latitude: 5.36, longitude: -4.0083 }, IN: { latitude: 28.6139, longitude: 77.209 } };
// Website SendServiceTiles routing: movers + multi have dedicated wizards, others preset service_type.
const ROUTE: Record<string, string> = {
  moto: '/send/book?service=moto', cargo: '/send/book?service=cargo', fresh: '/send/book?service=fresh_products',
  between_cities: '/send/book?service=between_cities', multi: '/send/book?service=multiple_shipments', movers: '/send/movers',
};
const txt = (o: any, k: string, lang: string) => (lang === 'fr' ? o?.[`${k}_fr`] || o?.[k] : o?.[k] || o?.[`${k}_fr`]) || '';
const tileImg = (u?: string) => (u?.startsWith('/send-tiles') ? `${WEB_ORIGIN}${u}` : absUrl(u));

export function SendMapHero({ section, country }: SectionProps) {
  const { address } = useApp();
  const p = address ? { latitude: address.latitude, longitude: address.longitude } : CENTER[country] || CENTER.CI;
  return <View testID={`cms-send-map-${section.id}`} style={styles.map}><SendMap points={[p]} route={[]} color={Y} height={256} /></View>;
}

export function SendPickupBar({ section }: SectionProps) {
  const { lang, address } = useApp();
  const c = section.config || {};
  return (
    <View style={styles.pickup} testID={`cms-send-pickup-${section.id}`}>
      <View style={styles.searchIcon}><Search color={Y} size={14} /></View>
      <Touchable testID="cms-send-pickup-btn" onPress={() => router.push('/address?send=pickup')} style={{ flex: 1 }}>
        <AppText size={14} numberOfLines={1} color={address ? colors.text : colors.textMuted}>{address?.line1 || txt(c, 'placeholder', lang)}</AppText>
      </Touchable>
      <Touchable testID="cms-send-add-stop" onPress={() => router.push('/send/book')} style={styles.addStop}>
        <Plus color={Y} size={14} /><AppText size={13} weight="semibold">{txt(c, 'add_stop_label', lang)}</AppText>
      </Touchable>
    </View>
  );
}

export function SendServiceTiles({ section, width }: SectionProps) {
  const { lang } = useApp();
  const { width: screen } = useWindowDimensions();
  const c = section.config || {};
  const tiles: any[] = (c.tiles || []).filter((x: any) => x.enabled !== false && x.key);
  const n = screen >= 1024 ? 3 : 2;
  const w = (width - 12 * (n - 1)) / n;
  const big = screen >= 768;
  return (
    <View testID={`cms-send-tiles-${section.id}`}>
      <AppText weight="bold" size={20} testID="cms-send-tiles-title">{lang === 'fr' ? c.title_fr || section.title : section.title || c.title_fr}</AppText>
      <AppText size={12} color={colors.textMuted} style={{ marginTop: 4, marginBottom: 12 }}>{lang === 'fr' ? c.subtitle_fr || section.subtitle : section.subtitle || c.subtitle_fr}</AppText>
      <View style={styles.grid}>
        {tiles.map((x) => (
          <Touchable key={x.key} testID={`send-tile-${x.key}`} onPress={() => router.push((ROUTE[x.key] || '/send/book') as any)} style={[styles.tile, { width: w, minHeight: big ? 248 : 212 }]} scale={0.985}>
            <View style={[styles.art, { height: big ? 160 : 128, backgroundColor: hexA(Y, 0.08) }]}>
              {x.image ? <Image source={tileImg(x.image)} style={{ width: '90%', height: big ? 144 : 112 }} contentFit="contain" cachePolicy="memory-disk" /> : null}
            </View>
            <View style={styles.tileBody}>
              <View style={{ flex: 1 }}>
                <AppText size={15} weight="semibold" numberOfLines={2}>{x.title_fr || x.title_en}</AppText>
                {x.title_en ? <AppText size={11} weight="medium" color={colors.textMuted} numberOfLines={1}>{x.title_en}</AppText> : null}
                <AppText size={11} color={colors.textMuted} numberOfLines={2} style={{ marginTop: 6 }}>{lang === 'fr' ? x.desc_fr || x.desc_en : x.desc_en || x.desc_fr}</AppText>
              </View>
              <View style={styles.go}><ArrowRight color="#0a0a0a" size={15} strokeWidth={2.6} /></View>
            </View>
          </Touchable>
        ))}
      </View>
    </View>
  );
}

export function SendTrustBanner({ section }: SectionProps) {
  const { lang } = useApp();
  return (
    <View style={styles.trust} testID={`cms-send-trust-${section.id}`}>
      <Sparkles color={Y} size={16} />
      <AppText size={12} color={colors.textMuted} style={{ flex: 1 }}>{txt(section.config, 'text', lang)}</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  map: { borderRadius: 24, overflow: 'hidden', borderWidth: 1, borderColor: colors.border },
  pickup: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 56, paddingLeft: 12, paddingRight: 8, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  searchIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: hexA(Y, 0.13), alignItems: 'center', justifyContent: 'center' },
  addStop: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 40, paddingLeft: 12, paddingRight: 16, borderRadius: 999, borderWidth: 1, borderColor: colors.border },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  tile: { borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  art: { alignItems: 'center', justifyContent: 'center' },
  tileBody: { flex: 1, flexDirection: 'row', alignItems: 'flex-end', gap: 10, padding: 12 },
  go: { width: 36, height: 36, borderRadius: 18, backgroundColor: Y, alignItems: 'center', justifyContent: 'center' },
  trust: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
});
