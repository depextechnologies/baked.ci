import { Image } from 'expo-image';
import { router } from 'expo-router';
import { ArrowRight, Info as InfoIcon, Plus, Search, Sparkles, X } from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import { AppState, Modal, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';

import { api } from '@/lib/api';
import { absUrl } from '@/lib/cms';
import { WEB_ORIGIN } from '@/lib/config';
import { useApp } from '@/state/AppContext';
import { colors, hexA, radius, themed } from '@/theme';
import { SendMap, type NearbyDriver } from '../../send/SendMap';
import { AppText, OnDark } from '../../ui/AppText';
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

const POLL_MS = 15000;

// Real online drivers around the origin (same endpoint + eligibility as the website map); paused in background.
function useNearbyDrivers(origin: { latitude: number; longitude: number }, country: string, enabled: boolean) {
  const [state, setState] = useState<{ drivers: NearbyDriver[]; count: number | null }>({ drivers: [], count: null });
  useEffect(() => {
    if (!enabled) { setState({ drivers: [], count: null }); return; }
    let alive = true;
    const load = () => api<any>(`/express/drivers/nearby?country=${country}&lat=${origin.latitude}&lng=${origin.longitude}`, { auth: false })
      .then((r) => alive && setState({ drivers: (r.drivers || []).map((d: any) => ({ latitude: d.lat, longitude: d.lng, vehicle_type: d.vehicle_type })), count: r.count ?? 0 }))
      .catch(() => {});
    load();
    const id = setInterval(() => { if (AppState.currentState === 'active') load(); }, POLL_MS);
    const sub = AppState.addEventListener('change', (s) => s === 'active' && load());
    return () => { alive = false; clearInterval(id); sub.remove(); };
  }, [origin.latitude, origin.longitude, country, enabled]);
  return state;
}

export function SendMapHero({ section, country }: SectionProps) {
  const { t, address } = useApp();
  const { height: screenH } = useWindowDimensions();
  const mapH = Math.max(300, Math.min(Math.round(screenH * 0.46), 520));
  const p = address ? { latitude: address.latitude, longitude: address.longitude } : CENTER[country] || CENTER.CI;
  const show = section.config?.show_drivers !== false;
  const { drivers, count } = useNearbyDrivers(p, country, show);
  return (
    <View testID={`cms-send-map-${section.id}`} style={styles.map}>
      <SendMap points={[p]} route={[]} nearby={drivers} color={Y} height={mapH} />
      {show && count != null ? (
        <View style={styles.chip} testID="send-nearby-count"><OnDark>
          <View style={[styles.dot, { backgroundColor: count ? '#22C55E' : '#737373' }]} />
          <AppText size={11} weight="semibold">{count ? t('send.nearby_drivers', { n: count }) : t('send.no_nearby_drivers')}</AppText>
        </OnDark></View>
      ) : null}
    </View>
  );
}

export function SendPickupBar({ section }: SectionProps) {
  const { lang, address } = useApp();
  const c = section.config || {};
  return (
    <View style={styles.pickup} testID={`cms-send-pickup-${section.id}`}>
      <View style={styles.searchIcon}><Search color={Y} size={14} /></View>
      <Touchable testID="cms-send-pickup-btn" onPress={() => router.push('/address')} style={{ flex: 1 }}>
        <AppText size={14} numberOfLines={1} color={address ? colors.text : colors.textMuted} testID="cms-send-pickup-address">{address ? address.formatted_address || [address.line1, address.city].filter(Boolean).join(', ') : txt(c, 'placeholder', lang)}</AppText>
      </Touchable>
      <Touchable testID="cms-send-add-stop" onPress={() => router.push('/send/book')} style={styles.addStop}>
        <Plus color={Y} size={14} /><AppText size={13} weight="semibold">{txt(c, 'add_stop_label', lang)}</AppText>
      </Touchable>
    </View>
  );
}

export function SendServiceTiles({ section, width }: SectionProps) {
  const { t, lang } = useApp();
  const [info, setInfo] = useState<any | null>(null);
  const c = section.config || {};
  const tiles: any[] = (c.tiles || []).filter((x: any) => x.enabled !== false && x.key);
  const gap = 10;
  const w = (width - gap * 2) / 3;
  const name = (x: any) => (lang === 'fr' ? x.title_fr || x.title_en : x.title_en || x.title_fr);
  return (
    <View testID={`cms-send-tiles-${section.id}`}>
      <AppText weight="bold" size={20} testID="cms-send-tiles-title">{lang === 'fr' ? c.title_fr || section.title : section.title || c.title_fr}</AppText>
      <AppText size={12} color={colors.textMuted} style={{ marginTop: 4, marginBottom: 12 }}>{lang === 'fr' ? c.subtitle_fr || section.subtitle : section.subtitle || c.subtitle_fr}</AppText>
      <View style={[styles.grid, { gap }]}>
        {tiles.map((x) => (
          <Touchable key={x.key} testID={`send-tile-${x.key}`} onPress={() => router.push((ROUTE[x.key] || '/send/book') as any)} style={[styles.tile, { width: w }]} scale={0.97}>
            <View style={[styles.art, { backgroundColor: hexA(Y, 0.08) }]}>
              {x.image ? <Image source={tileImg(x.image)} style={{ width: '88%', height: '84%' }} contentFit="contain" cachePolicy="memory-disk" /> : null}
            </View>
            <View style={styles.tileBody}>
              <AppText size={12} weight="semibold" align="center" numberOfLines={2} style={{ lineHeight: 15 }} testID={`send-tile-name-${x.key}`}>{name(x)}</AppText>
            </View>
            <Touchable testID={`send-tile-info-${x.key}`} onPress={(e: any) => { e?.stopPropagation?.(); setInfo(x); }} hitSlop={10} style={styles.info} accessibilityLabel={t('send.info')}>
              <InfoIcon color="#fff" size={14} />
            </Touchable>
          </Touchable>
        ))}
      </View>
      <Modal visible={!!info} transparent animationType="fade" onRequestClose={() => setInfo(null)}>
        <Pressable style={styles.backdrop} onPress={() => setInfo(null)} testID="send-tile-info-backdrop">
          <Pressable style={styles.sheet} onPress={() => {}} testID="send-tile-info-sheet">
            {info?.image ? <View style={styles.sheetArt}><Image source={tileImg(info.image)} style={{ width: '70%', height: 110 }} contentFit="contain" /></View> : null}
            <AppText weight="bold" size={18} testID="send-tile-info-title">{info ? name(info) : ''}</AppText>
            <AppText size={14} color={colors.textMuted} style={{ marginTop: 6 }} testID="send-tile-info-desc">{info ? (lang === 'fr' ? info.desc_fr || info.desc_en : info.desc_en || info.desc_fr) : ''}</AppText>
            <Touchable testID="send-tile-info-book" onPress={() => { const k = info?.key; setInfo(null); router.push((ROUTE[k] || '/send/book') as any); }} style={styles.sheetBtn}>
              <AppText size={14} weight="bold" color="#0a0a0a">{t('send.book_service')}</AppText><ArrowRight color="#0a0a0a" size={16} />
            </Touchable>
            <Touchable testID="send-tile-info-close" onPress={() => setInfo(null)} style={styles.sheetClose} hitSlop={10}><X color={colors.textMuted} size={18} /></Touchable>
          </Pressable>
        </Pressable>
      </Modal>
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

const styles = themed(() => StyleSheet.create({
  map: { borderRadius: 24, overflow: 'hidden', borderWidth: 1, borderColor: colors.border },
  chip: { position: 'absolute', top: 12, left: 12, flexDirection: 'row', alignItems: 'center', gap: 8, height: 32, paddingHorizontal: 12, borderRadius: 999, backgroundColor: 'rgba(0,0,0,0.7)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  dot: { width: 8, height: 8, borderRadius: 4 },
  pickup: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 56, paddingLeft: 12, paddingRight: 8, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  searchIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: hexA(Y, 0.13), alignItems: 'center', justifyContent: 'center' },
  addStop: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 40, paddingLeft: 12, paddingRight: 16, borderRadius: 999, borderWidth: 1, borderColor: colors.border },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  tile: { borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  art: { width: '100%', aspectRatio: 1.15, alignItems: 'center', justifyContent: 'center' },
  tileBody: { minHeight: 42, paddingHorizontal: 6, paddingVertical: 8, alignItems: 'center', justifyContent: 'center' },
  info: { position: 'absolute', top: 6, right: 6, width: 26, height: 26, borderRadius: 13, backgroundColor: 'rgba(0,0,0,0.6)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 22, paddingBottom: 34, borderWidth: 1, borderColor: colors.border },
  sheetArt: { height: 130, borderRadius: 16, backgroundColor: hexA(Y, 0.08), alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  sheetBtn: { marginTop: 18, height: 50, borderRadius: 14, backgroundColor: Y, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  sheetClose: { position: 'absolute', top: 14, right: 14 },
  trust: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
}));
