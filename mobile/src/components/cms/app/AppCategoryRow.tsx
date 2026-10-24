import { Image } from 'expo-image';
import { router } from 'expo-router';
import { ChevronRight, Shirt, ShoppingBasket, UtensilsCrossed } from 'lucide-react-native';
import React, { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { useFetch } from '@/hooks/useFetch';
import { absUrl, sectionText } from '@/lib/cms';
import type { ModuleCode } from '@/lib/modules';
import { useApp } from '@/state/AppContext';
import { accentText, colors, hexA, themed } from '@/theme';
import { categoryEndpoint } from '../../module/moduleData';
import { AppText } from '../../ui/AppText';
import { Touchable } from '../../ui/Button';
import { Skeleton } from '../../ui/StateView';
import type { SectionProps } from '../types';

type Src = 'food' | 'mart' | 'shop';
const ICON = { food: UtensilsCrossed, mart: ShoppingBasket, shop: Shirt };
const VIEW_ALL: Record<Src, string> = { food: '/food/discover', mart: '/mart/category/all', shop: '/shop/category/all' };
const open = (src: Src, key: string) =>
  router.push((src === 'food' ? `/food/discover?category=${key}` : `/${src}/category/${key}`) as any);

type Cat = { key: string; name: string; image?: string | null };

function CatTile({ src, cat, accent }: { src: Src; cat: Cat; accent: string }) {
  const [failed, setFailed] = useState(false);
  const Icon = ICON[src];
  return (
    <Touchable testID={`app-cat-${src}-${cat.key}`} onPress={() => open(src, cat.key)} style={styles.tile} scale={0.95}>
      <View style={styles.imgBox}>
        {cat.image && !failed
          ? <Image source={cat.image} style={StyleSheet.absoluteFill} contentFit="contain" transition={150} onError={() => setFailed(true)} />
          : <View style={[styles.fb, { backgroundColor: hexA(accent, 0.12) }]} testID={`app-cat-${src}-${cat.key}-fallback`}><Icon color={accent} size={26} /></View>}
      </View>
      <AppText size={12} weight="medium" numberOfLines={1} align="center">{cat.name}</AppText>
    </Touchable>
  );
}

const nameOf = (c: any, lang: string) => (lang === 'en' ? c.name_en || c.name : c.name_fr || c.name) || c.slug || c.code;

function buildCats(cfg: any, data: any, lang: string): Cat[] {
  const all: any[] = (Array.isArray(data) ? data : data?.items || []).filter((c: any) => c.code !== 'all');
  const byKey = new Map(all.map((c) => [String(c.code || c.slug), c]));
  const picked: Cat[] = cfg.items?.length
    ? cfg.items.filter((it: any) => it.enabled !== false && byKey.has(String(it.key))).map((it: any) => {
      const c = byKey.get(String(it.key));
      const label = lang === 'en' ? it.label_en : it.label_fr;
      return { key: String(it.key), name: label || nameOf(c, lang), image: absUrl(it.image) || c.image };
    })
    : all.map((c) => ({ key: String(c.code || c.slug), name: nameOf(c, lang), image: c.image }));
  return picked.slice(0, Number(cfg.max_items) || 12);
}

// Horizontal category carousel fed by the source module's real catalogue (FOOD / MART / SHOP).
export function AppCategoryRow({ section, country }: SectionProps) {
  const { lang, t } = useApp();
  const cfg = section.config || {};
  const src = (['food', 'mart', 'shop'].includes(cfg.source_module) ? cfg.source_module : 'food') as Src;
  const accent = cfg.accent || colors.accent;
  const ink = accentText(accent);
  const { data, loading } = useFetch<any>(categoryEndpoint(src as ModuleCode, country), [src, country]);
  const cats = buildCats(cfg, data, lang);
  if (!loading && !cats.length) return null;
  const title = sectionText(section, 'title', lang);
  return (
    <View testID={`app-row-${src}`}>
      <View style={styles.head}>
        <AppText weight="bold" size={20} numberOfLines={1} style={{ flex: 1, letterSpacing: -0.3 }} testID={`app-row-${src}-title`}>{title}</AppText>
        <Touchable testID={`app-row-${src}-view-all`} onPress={() => router.push(VIEW_ALL[src] as any)} style={styles.link} hitSlop={8}>
          <AppText size={14} weight="semibold" color={ink}>{t('home.view_all')}</AppText><ChevronRight color={ink} size={16} />
        </Touchable>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rail}>
        {loading && !cats.length
          ? [0, 1, 2, 3, 4].map((i) => <Skeleton key={i} w={92} h={104} r={14} />)
          : cats.map((c) => <CatTile key={c.key} src={src} cat={c} accent={accent} />)}
      </ScrollView>
    </View>
  );
}

const styles = themed(() => StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, marginBottom: 10 },
  link: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  rail: { paddingHorizontal: 14, gap: 8 },
  tile: { width: 92, height: 104, borderRadius: 14, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, padding: 6, justifyContent: 'space-between' },
  imgBox: { height: 66, alignItems: 'center', justifyContent: 'center' },
  fb: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
}));
