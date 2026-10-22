import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Sparkles } from 'lucide-react-native';
import React, { useState } from 'react';
import { router } from 'expo-router';
import { RefreshControl, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';

import { useAccountSummary } from '@/hooks/useAccountSummary';
import { useFetch } from '@/hooks/useFetch';
import { useHomepage } from '@/hooks/useHomepage';
import { useModuleNav } from '@/hooks/useModuleNav';
import { MODULES, type ModuleCode } from '@/lib/modules';
import { useApp } from '@/state/AppContext';
import { colors, hexA, radius } from '@/theme';
import { BrandName } from '../BrandName';
import { AddressBar, SearchBar } from '../home/AddressBar';
import { BellButton } from '../home/MainHeader';
import { Logo } from '../Logo';
import { AppText } from '../ui/AppText';
import { ErrorView, Skeleton } from '../ui/StateView';
import { ModuleIcon } from '../ModuleIcon';
import { CartBar, CartButton } from '../commerce/CartBar';
import { Touchable } from '../ui/Button';
import { FoodHomeSections, FoodModeToggle } from './FoodHomeSections';
import { MartHomeSections } from './MartHomeSections';
import { categoryEndpoint, toTiles, type Tile } from './moduleData';
import { CmsSections } from '../cms/registry';

// Modules whose homepage body is fully driven by Super Admin Homepage Management.
const CMS_MODULES: ModuleCode[] = ['shop'];

export function ModuleHome({ code }: { code: ModuleCode }) {
  const { t, lang, country } = useApp();
  const { goMainHome } = useModuleNav();
  const { unread } = useAccountSummary();
  const m = MODULES[code];
  const cms = CMS_MODULES.includes(code);
  const cc = country?.code || 'CI';
  const { width } = useWindowDimensions();
  const hp = useHomepage(cms ? code : null, cc);
  const { data, loading, error, reload } = useFetch<any>(cms ? null : categoryEndpoint(code, cc), [code]);
  const tiles = toTiles(code, data, lang, t, m.image);

  const commerce = code !== 'express';
  const onTile = code === 'mart' ? (id: string) => router.push(`/mart/category/${id}`)
    : code === 'food' ? (id: string) => router.push(`/food/discover?category=${id}`)
    : code === 'shop' ? (id: string) => router.push(`/shop/category/${id}`)
    : (id: string) => router.push(id === 'packers_movers' ? '/send/movers' : `/send/book?service=${id}`);
  const searchTo = code === 'mart' ? '/mart/category/all?focus=1' : code === 'food' ? '/food/discover?focus=1' : code === 'shop' ? '/shop/category/all' : '/send/book';

  return (
    <View style={{ flex: 1 }}>
    <ScrollView testID={`module-home-${code}`} contentContainerStyle={{ paddingBottom: commerce ? 96 : 28 }} showsVerticalScrollIndicator={false}
      refreshControl={cms ? <RefreshControl refreshing={hp.refreshing} onRefresh={hp.refresh} tintColor={m.color} colors={[m.color]} /> : undefined}>
      <View style={styles.header}>
        <Logo height={30} onPress={goMainHome} testID="module-logo-home" />
        <View style={[styles.chip, { borderColor: hexA(m.color, 0.5) }]}><BrandName code={code} size={14} /></View>
        <View style={{ flex: 1 }} />
        <BellButton unread={unread} />
        {commerce ? <CartButton /> : null}
      </View>
      <AddressBar accent={m.color} />
      <SearchBar placeholder={`${t('home.search_ph')} · ${m.label}`} to={searchTo} />
      {code === 'food' ? <FoodModeToggle /> : null}

      {cms ? (
        <View style={{ marginTop: 4 }}>
          <CmsSections sections={hp.data?.sections} loading={hp.loading} offline={hp.offline} accent={m.color} module={code} country={cc} width={width - 32} />
        </View>
      ) : (
      <>
      <View style={[styles.hero, { marginTop: code === 'food' ? 14 : 0, borderColor: hexA(m.color, 0.45) }]} testID="module-hero">
        <LinearGradient colors={[hexA(m.color, 0.32), hexA(m.color, 0.05), '#000']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
        <View style={{ flex: 1, zIndex: 1 }}>
          <BrandName code={code} size={26} />
          <AppText weight="semibold" size={17} style={{ marginTop: 8 }}>{t(`module.hero.${code}` as any)}</AppText>
        </View>
        <Image source={m.image} style={styles.heroImg} contentFit="contain" />
      </View>

      <AppText weight="bold" size={19} style={styles.section}>
        {code === 'food' ? t('module.cuisines') : code === 'express' ? t('module.services') : t('module.categories')}
      </AppText>
      {error ? <ErrorView onRetry={reload} /> : (
        <View style={styles.grid} testID="module-categories">
          {loading ? Array.from({ length: 8 }).map((_, i) => <View key={i} style={styles.tile}><Skeleton h={76} r={18} /></View>)
            : tiles.slice(0, 12).map((c) => (
              <CategoryTile key={c.id} tile={c} color={m.color} icon={m.icon} onPress={onTile && (() => onTile(c.id))} />
            ))}
        </View>
      )}

      </>
      )}
      {code === 'mart' ? <MartHomeSections /> : null}
      {code === 'food' ? <FoodHomeSections /> : null}
      {!commerce ? (
        <View style={[styles.note, { borderColor: hexA(m.color, 0.3) }]} testID="module-next-phase-note">
          <Sparkles color={m.color} size={18} />
          <AppText size={13} color={colors.textMuted} style={{ flex: 1 }}>{t('module.next_phase')}</AppText>
        </View>
      ) : null}
    </ScrollView>
    {commerce ? <CartBar color={m.color} inTabs /> : null}
    </View>
  );
}

function CategoryTile({ tile, color, icon, onPress }: { tile: Tile; color: string; icon: any; onPress?: () => void }) {
  const [failed, setFailed] = useState(false);
  return (
    <Touchable disabled={!onPress} onPress={onPress} style={styles.tile} testID={`module-cat-${tile.id}`}>
      <View style={[styles.tileImg, { backgroundColor: hexA(color, 0.12) }]}>
        {tile.image && !failed
          ? <Image source={tile.image as any} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} onError={() => setFailed(true)} />
          : tile.icon ? <tile.icon color={color} size={26} /> : <ModuleIcon icon={icon} color={color} size={26} />}
      </View>
      <AppText weight="medium" size={12} align="center" numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.8}>{tile.name}</AppText>
    </Touchable>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 18, paddingTop: 6, paddingBottom: 14 },
  chip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.pill, borderWidth: 1, backgroundColor: colors.surface },
  hero: { marginHorizontal: 18, height: 150, borderRadius: radius.lg, borderWidth: 1, overflow: 'hidden', flexDirection: 'row', alignItems: 'center', padding: 18 },
  heroImg: { width: '46%', height: '100%' },
  section: { paddingHorizontal: 18, marginTop: 24, marginBottom: 12 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 12 },
  tile: { width: '25%', paddingHorizontal: 6, marginBottom: 14, alignItems: 'center', gap: 6 },
  tileImg: { width: '100%', aspectRatio: 1, borderRadius: 18, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  note: { flexDirection: 'row', gap: 10, marginHorizontal: 18, marginTop: 10, padding: 14, borderRadius: radius.md, borderWidth: 1, backgroundColor: colors.surface },
});
