import { Image } from 'expo-image';
import { router } from 'expo-router';
import { ArrowRight, Store } from 'lucide-react-native';
import React, { useState } from 'react';
import { ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';

import { useFetch } from '@/hooks/useFetch';
import { absUrl, nativeLink, pick, sectionText } from '@/lib/cms';
import { useApp } from '@/state/AppContext';
import type { MartProduct } from '@/state/CartContext';
import { colors, themed } from '@/theme';
import { ProductCard } from '../../commerce/ProductCard';
import { AppText } from '../../ui/AppText';
import { Touchable } from '../../ui/Button';
import type { SectionProps } from '../types';

const KEYWORDS = ['', 'bestsellers', 'new', 'newest', 'featured'];

// Website SectionHeader: green eyebrow, bold title, subtitle; "Voir tout" only from tablet width (hidden md:inline-flex).
export function MartHeader({ eyebrow, title, subtitle, to, accent, testID }: { eyebrow?: string; title?: string; subtitle?: string; to?: string | null; accent: string; testID: string }) {
  const { t } = useApp();
  const { width } = useWindowDimensions();
  return (
    <View style={styles.head} testID={testID}>
      <View style={{ flex: 1 }}>
        {eyebrow ? <AppText size={10} weight="semibold" color={accent} style={styles.caps}>{eyebrow}</AppText> : null}
        {title ? <AppText weight="bold" size={width >= 768 ? 30 : 21} testID={`${testID}-title`}>{title}</AppText> : null}
        {subtitle ? <AppText size={14} color={colors.textMuted} style={{ marginTop: 4 }}>{subtitle}</AppText> : null}
      </View>
      {to && width >= 768 ? <Touchable testID={`${testID}-view-all`} onPress={() => router.push(to as any)} style={styles.link}>
        <AppText size={12} weight="semibold" color={accent} style={styles.caps}>{t('cms.view_all')}</AppText><ArrowRight color={accent} size={12} /></Touchable> : null}
    </View>
  );
}

export function MartCategoryGrid({ section, accent }: SectionProps) {
  const { t, lang } = useApp();
  const { width } = useWindowDimensions();
  const cats: any[] = section.config?.categories || [];
  const n = width >= 768 && (section.config?.columns || 6) >= 6 ? 6 : width >= 640 ? 4 : 3;
  const title = !section.title || section.title === 'Categories' ? t('module.categories') : sectionText(section, 'title', lang);
  return (
    <View testID={`cms-mart-categories-${section.id}`}>
      <MartHeader testID="cms-mart-categories" eyebrow={t('cms.mart_eyebrow')} title={title} subtitle={sectionText(section, 'subtitle', lang)} to="/mart/category/all" accent={accent} />
      <View style={styles.grid}>
        {cats.map((c) => (
          <View key={c.slug || c.name} style={{ width: `${100 / n}%`, padding: 6 }}>
            <Touchable testID={`cms-mart-cat-${c.slug || c.name}`} scale={0.97} style={styles.cat} onPress={() => router.push((c.link ? nativeLink(c.link, 'mart') : `/mart/category/${c.slug}`) as any)}>
              <CatImage src={absUrl(c.image)} accent={accent} big={width >= 768} />
              <AppText size={12} weight="semibold" align="center" numberOfLines={2}>{pick(c, 'name', lang)}</AppText>
            </Touchable>
          </View>
        ))}
      </View>
    </View>
  );
}

function CatImage({ src, accent, big }: { src: string | null; accent: string; big: boolean }) {
  const [failed, setFailed] = useState(false);
  const s = big ? 80 : 64;
  return (
    <View style={[styles.catImg, { width: s, height: s, backgroundColor: 'rgba(119,188,31,0.1)' }]}>
      {src && !failed ? <Image source={src} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="memory-disk" onError={() => setFailed(true)} /> : <Store color={accent} size={26} />}
    </View>
  );
}

export function MartProductCarousel({ section, accent, country, width: content }: SectionProps) {
  const { lang } = useApp();
  const { width } = useWindowDimensions();
  const cfg = section.config || {};
  const filter = String(cfg.filter || '').trim();
  const cat = KEYWORDS.includes(filter.toLowerCase()) ? null : filter;
  const sort = ['new', 'newest'].includes(filter.toLowerCase()) ? 'newest' : 'popularity';
  const q = `/mart/products?country=${country}&limit=${Number(cfg.limit) || 12}&sort=${sort}${cat ? `&category=${cat}` : ''}${cfg.subcategory ? `&subcategory=${cfg.subcategory}` : ''}`;
  const { data } = useFetch<MartProduct[]>(q, [q]);
  const per = width >= 1024 ? 5.5 : width >= 768 ? 4.5 : width >= 640 ? 3.1 : 2.17;
  const cardW = (content - 12 * Math.floor(per)) / per;
  const to = cfg.link ? nativeLink(cfg.link, 'mart') : cat ? `/mart/category/${cat}` : null;
  return (
    <View testID={`cms-mart-products-${section.id}`}>
      <MartHeader testID={`cms-mart-products-head-${section.id}`} title={sectionText(section, 'title', lang)} subtitle={sectionText(section, 'subtitle', lang)} to={to} accent={accent} />
      {data && !data.length ? <AppText size={12} color={colors.textMuted} testID={`cms-mart-products-empty-${section.id}`}>—</AppText> : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12 }} snapToInterval={cardW + 12} decelerationRate="fast">
          {(data || []).map((p) => <ProductCard key={p.id} p={p} width={cardW} />)}
        </ScrollView>
      )}
    </View>
  );
}

const styles = themed(() => StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'flex-end', gap: 12, marginBottom: 18 },
  caps: { letterSpacing: 2, textTransform: 'uppercase', marginBottom: 4 },
  link: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -6 },
  cat: { borderRadius: 16, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: 12, alignItems: 'center', gap: 12, minHeight: 130 },
  catImg: { borderRadius: 16, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
}));
