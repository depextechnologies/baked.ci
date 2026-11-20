import { Image } from 'expo-image';
import React from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';

import { useModuleNav } from '@/hooks/useModuleNav';
import { absUrl, pick } from '@/lib/cms';
import { HOME_GRID_ORDER, MODULES, type ModuleCode } from '@/lib/modules';
import { useApp } from '@/state/AppContext';
import { colors, hexA, themed } from '@/theme';
import { ModuleLogo } from '../ModuleLogo';
import { AppText } from '../ui/AppText';
import { Touchable } from '../ui/Button';
import { SafeImage } from '../ui/SafeImage';

type TileCfg = { module: ModuleCode; enabled?: boolean; tagline_fr?: string; tagline_en?: string; tagline?: string; image?: string; accent?: string };

// Branded card artwork per module.
const ART: Partial<Record<ModuleCode, number>> = {
  shop: require('../../../assets/images/brand/card-shop.png'),
  mart: require('../../../assets/images/brand/card-mart.png'),
  express: require('../../../assets/images/brand/card-send.png'),
  food: require('../../../assets/images/brand/card-food.png'),
  immo: require('../../../assets/images/brand/card-immo.png'),
  auto: require('../../../assets/images/brand/card-auto.png'),
};

function ModuleCard({ cfg, h }: { cfg: TileCfg; h: number }) {
  const { t, lang } = useApp();
  const { openModule } = useModuleNav();
  const m = MODULES[cfg.module];
  const accent = cfg.accent || m.color;
  const soon = m.status !== 'active';
  const tagline = pick(cfg, 'tagline', lang) || t(`mod.${cfg.module}.desc` as any);
  const art = ART[cfg.module];
  return (
    <Touchable testID={`home-card-${cfg.module}`} disabled={soon} onPress={() => openModule(cfg.module)} scale={0.97}
      style={[styles.card, { height: h, borderColor: hexA(accent, 0.18) }]}>
      <View style={styles.text}>
        <ModuleLogo module={cfg.module} size={22} testID={`home-card-logo-${cfg.module}`} />
        <AppText size={12.5} color={colors.textSoft} numberOfLines={2} style={styles.tag} testID={`home-card-tagline-${cfg.module}`}>{tagline}</AppText>
      </View>
      {art ? <Image source={art} style={styles.art} contentFit="contain" contentPosition="bottom right" testID={`home-card-art-${cfg.module}`} />
        : <SafeImage source={absUrl(cfg.image) || m.image} placeholder={m.image} style={styles.art} contentFit="contain" contentPosition="bottom right" testID={`home-card-art-${cfg.module}`}
            fallback={<Image source={m.image} style={styles.art} contentFit="contain" contentPosition="bottom right" />} />}
      {soon ? (
        <View style={[styles.soon, { backgroundColor: hexA(accent, 0.14) }]} testID={`home-card-soon-${cfg.module}`}>
          <AppText weight="bold" size={9} color={accent} style={{ letterSpacing: 0.8 }}>{t('common.soon').toUpperCase()}</AppText>
        </View>
      ) : null}
    </Touchable>
  );
}

// Two-per-row module cards; order, taglines and visibility come from Super Admin (app_module_grid).
export function HomeModuleCards({ items }: { items?: TileCfg[] }) {
  // Size the three rows so all six cards fit above the tab bar.
  const { height } = useWindowDimensions();
  const h = Math.max(108, Math.min(160, Math.round((height - 520) / 3)));
  const list = (items?.length ? items : HOME_GRID_ORDER.map((module): TileCfg => ({ module })))
    .filter((i) => i.enabled !== false && i.module in MODULES);
  return (
    <View style={styles.grid} testID="home-module-cards">
      {list.map((cfg) => <ModuleCard key={cfg.module} cfg={cfg} h={h} />)}
    </View>
  );
}

const styles = themed(() => StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 10, paddingHorizontal: 14 },
  card: { width: '48.6%', borderRadius: 18, borderWidth: 1, overflow: 'hidden', backgroundColor: colors.surface },
  text: { paddingHorizontal: 12, paddingTop: 11, gap: 3, zIndex: 1 },
  tag: { lineHeight: 16, maxWidth: '62%' },
  art: { position: 'absolute', right: -10, bottom: -8, width: '60%', height: '58%' },
  soon: { position: 'absolute', top: 11, right: 10, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 999 },
}));
