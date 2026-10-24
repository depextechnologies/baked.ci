import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { ChevronRight } from 'lucide-react-native';
import React from 'react';
import { StyleSheet, View } from 'react-native';

import { useModuleNav } from '@/hooks/useModuleNav';
import { absUrl, pick } from '@/lib/cms';
import { HOME_GRID_ORDER, MODULES, type ModuleCode } from '@/lib/modules';
import { useApp } from '@/state/AppContext';
import { colors, fonts, getScheme, hexA, themed } from '@/theme';
import { AppText } from '../../ui/AppText';
import { Touchable } from '../../ui/Button';
import type { SectionProps } from '../types';

type TileCfg = { module: ModuleCode; enabled?: boolean; tagline_fr?: string; tagline_en?: string; tagline?: string; image?: string; accent?: string };

// Brand codes for the home tiles (same in dark and light); Super Admin can still override per tile.
const BRAND: Record<ModuleCode, string> = { express: '#FCC44C', food: '#77BC1F', mart: '#77BC1F', shop: '#FCC44C', immo: '#A659FF', auto: '#FF4C52' };
const FALLBACK: TileCfg[] = HOME_GRID_ORDER.map((module) => ({ module }));

function AppTile({ cfg }: { cfg: TileCfg }) {
  const { t, lang } = useApp();
  const { openModule } = useModuleNav();
  const m = MODULES[cfg.module];
  const accent = cfg.accent || BRAND[cfg.module] || m.color;
  const ink = accent;
  const suffix = getScheme() === 'light' ? '#000000' : '#FFFFFF';
  const soon = m.status !== 'active';
  const tagline = pick(cfg, 'tagline', lang) || (lang === 'en' ? cfg.tagline_en : undefined) || t(`mod.${cfg.module}.desc` as any);
  return (
    <Touchable testID={`app-tile-${cfg.module}`} disabled={soon} accessibilityState={{ disabled: soon }} onPress={() => openModule(cfg.module)}
      style={[styles.tile, { borderColor: hexA(accent, 0.55) }]} scale={0.96}>
      <LinearGradient colors={[hexA(accent, 0.26), hexA(accent, 0.06), colors.surface]} start={{ x: 0, y: 0 }} end={{ x: 0.9, y: 1 }} style={StyleSheet.absoluteFill} />
      <Image source={absUrl(cfg.image) || m.image} placeholder={m.image} style={styles.img} contentFit="contain" transition={200} />
      {soon ? (
        <View style={[styles.soon, { borderColor: hexA(accent, 0.7) }]} testID={`app-tile-soon-${cfg.module}`}>
          <AppText weight="bold" size={9} color={ink} style={{ letterSpacing: 0.8 }}>{t('common.soon').toUpperCase()}</AppText>
        </View>
      ) : null}
      <AppText size={14} numberOfLines={1} style={{ lineHeight: 17 }} testID={`app-tile-name-${cfg.module}`}>
        <AppText size={14} style={{ fontFamily: fonts.black, color: ink, letterSpacing: -0.4 }}>{m.label}</AppText>
        <AppText size={12} weight="bold" color={suffix}>bakēd</AppText>
      </AppText>
      <View style={styles.foot}>
        <AppText size={10.5} color={colors.textSoft} numberOfLines={2} style={{ flex: 1, lineHeight: 13 }} testID={`app-tile-tagline-${cfg.module}`}>{tagline}</AppText>
        <View style={[styles.arrow, { borderColor: accent }]}><ChevronRight color={ink} size={13} strokeWidth={2.6} /></View>
      </View>
    </Touchable>
  );
}

// Three-column service grid; tiles, taglines, art and order come from Super Admin.
export function AppGrid({ section }: Partial<SectionProps>) {
  const items: TileCfg[] = section?.config?.items?.length ? section.config.items : FALLBACK;
  const list = items.filter((i) => i.enabled !== false && i.module in MODULES);
  return (
    <View style={styles.grid} testID="app-grid">
      {list.map((cfg) => <AppTile key={cfg.module} cfg={cfg} />)}
    </View>
  );
}

const styles = themed(() => StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 10, paddingHorizontal: 14 },
  tile: { width: '32%', height: 136, borderRadius: 16, borderWidth: 1.2, overflow: 'hidden', padding: 9, justifyContent: 'flex-end', backgroundColor: colors.surface },
  img: { position: 'absolute', top: 6, left: 8, right: 8, height: 70 },
  soon: { position: 'absolute', top: 7, right: 7, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 999, borderWidth: 1, backgroundColor: colors.scrim },
  foot: { flexDirection: 'row', alignItems: 'flex-end', gap: 4, minHeight: 26, marginTop: 1 },
  arrow: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
}));
