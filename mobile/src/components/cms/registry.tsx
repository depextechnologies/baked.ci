import React from 'react';
import { StyleSheet, View } from 'react-native';
import { WifiOff } from 'lucide-react-native';

import type { CmsSection } from '@/lib/cms';
import { useApp } from '@/state/AppContext';
import { colors } from '@/theme';
import { AppText } from '../ui/AppText';
import { Skeleton } from '../ui/StateView';
import { BannerTrio, BrandRow, CtaStrip, PromoBanner } from './Blocks';
import { CategoryGrid } from './CategoryGrid';
import { HeroCarousel } from './HeroCarousel';
import { MartAppPromo, MartBannerRow, MartBrands, MartCtaStrip, MartPromo, MartTrust } from './mart/MartBlocks';
import { MartHero } from './mart/MartHero';
import { MartCategoryGrid, MartProductCarousel } from './mart/MartSections';
import { ProductCarousel } from './ProductCarousel';
import type { SectionProps } from './types';

// CMS section_type -> native component. Unknown types render nothing (same rule as the website).
export const SECTION_REGISTRY: Record<string, React.ComponentType<SectionProps>> = {
  hero: HeroCarousel,
  category_grid: CategoryGrid,
  product_carousel: ProductCarousel,
  promotional_banner: PromoBanner,
  banner_trio: BannerTrio,
  brand_carousel: BrandRow,
  cta_strip: CtaStrip,
};

// Per-module designs mirror each website renderer (MART = ConfigHomepage.jsx, SHOP = ShopHome.jsx).
const MODULE_REGISTRY: Record<string, Record<string, React.ComponentType<SectionProps>>> = {
  mart: {
    hero: MartHero, category_grid: MartCategoryGrid, product_carousel: MartProductCarousel, promotional_banner: MartPromo,
    banner_trio: MartBannerRow, brand_carousel: MartBrands, app_promotion: MartAppPromo, cta_strip: MartCtaStrip, trust_strip: MartTrust,
  },
};
export const componentFor = (module: string, type: string) => MODULE_REGISTRY[module]?.[type] ?? SECTION_REGISTRY[type];

type Props = { sections: CmsSection[] | undefined; loading: boolean; offline: boolean; accent: string; module: string; country: string; width: number };

export function CmsSections({ sections, loading, offline, accent, module, country, width }: Props) {
  const { t } = useApp();
  return (
    <View style={styles.wrap} testID={`cms-home-${module}`}>
      {offline ? (
        <View style={styles.offline} testID="cms-offline"><WifiOff color="#FCC44C" size={14} /><AppText size={12} color="#FCC44C">{t('cms.offline')}</AppText></View>
      ) : null}
      {loading ? <><Skeleton h={220} r={16} /><Skeleton h={300} r={16} /></>
        : !sections?.length ? <AppText size={13} color={colors.textMuted} testID="cms-empty">{t('cms.empty')}</AppText>
          : sections.map((s) => {
            const C = componentFor(module, s.section_type);
            return C ? <View key={s.id} testID={`cms-section-${s.section_type}-${s.id}`}><C section={s} accent={accent} module={module} country={country} width={width} /></View> : null;
          })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: 16, gap: 36 },
  offline: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, borderRadius: 10, backgroundColor: 'rgba(252,196,76,0.08)', borderWidth: 1, borderColor: 'rgba(252,196,76,0.3)', marginBottom: -20 },
});
