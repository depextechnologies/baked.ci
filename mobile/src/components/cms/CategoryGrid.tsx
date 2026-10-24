import { Image } from 'expo-image';
import { router } from 'expo-router';
import { ShoppingBag } from 'lucide-react-native';
import React, { useState } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';

import { useFetch } from '@/hooks/useFetch';
import { absUrl, nativeLink, sectionText } from '@/lib/cms';
import { useApp } from '@/state/AppContext';
import { colors, hexA, themed } from '@/theme';
import { AppText } from '../ui/AppText';
import { Touchable } from '../ui/Button';
import { SectionHeader } from './SectionHeader';
import type { SectionProps } from './types';

const cols = (w: number) => (w >= 1000 ? 6 : w >= 700 ? 4 : 3);

// Website parity: bordered cards, 56px icon/image box, catalogue name + sub-category count; 3 / 4 / 6 columns.
export function CategoryGrid({ section, accent, module, country, width }: SectionProps) {
  const { t, lang } = useApp();
  const tree = useFetch<any[]>(module === 'shop' ? `/shop/catalogue?country=${country}` : null, [country]);
  const cats: any[] = section.config?.categories || [];
  const { width: screen } = useWindowDimensions();
  const n = cols(screen); const gap = 12; const w = (width - gap * (n - 1)) / n;
  const base = module === 'shop' ? '/shop/category' : `/${module}/category`;
  return (
    <View testID={`cms-category-grid-${section.id}`}>
      <SectionHeader testID="cms-category-grid" title={sectionText(section, 'title', lang)} subtitle={sectionText(section, 'subtitle', lang)} accent={accent} to={`${base}/all`} />
      <View style={[styles.grid, { gap }]}>
        {cats.map((c) => {
          const meta = (tree.data || []).find((x) => x.slug === c.slug);
          const name = meta ? (lang === 'fr' ? meta.name_fr || meta.name_en : meta.name_en || meta.name_fr) : c.name;
          const subs = Array.isArray(meta?.subcategories) ? meta.subcategories.length : 0;
          return (
            <Touchable key={c.slug || c.name} testID={`cms-category-tile-${c.slug || c.name}`} scale={0.97} style={[styles.card, { width: w }]}
              onPress={() => router.push((c.link ? nativeLink(c.link, module) : `${base}/${c.slug}`) as any)}>
              <Thumb src={absUrl(c.image || meta?.image)} accent={accent} />
              <AppText weight="semibold" size={13} align="center" numberOfLines={2}>{name}</AppText>
              {meta ? <AppText size={11} color={colors.textMuted} align="center">{t('cms.sub_count', { n: subs })}</AppText> : null}
            </Touchable>
          );
        })}
      </View>
    </View>
  );
}

function Thumb({ src, accent }: { src: string | null; accent: string }) {
  const [failed, setFailed] = useState(false);
  return (
    <View style={[styles.icon, { backgroundColor: src && !failed ? 'transparent' : hexA(accent, 0.13) }]}>
      {src && !failed ? <Image source={src} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="memory-disk" onError={() => setFailed(true)} />
        : <ShoppingBag color={accent} size={22} />}
    </View>
  );
}

const styles = themed(() => StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  card: { borderWidth: 1, borderColor: colors.border, borderRadius: 12, backgroundColor: colors.surface, paddingVertical: 16, paddingHorizontal: 8, alignItems: 'center', gap: 10, minHeight: 150 },
  icon: { width: 56, height: 56, borderRadius: 16, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
}));
