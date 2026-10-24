import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { Bike, ChevronRight, Clock, Heart, MapPin, ShoppingBag, Star, Utensils } from 'lucide-react-native';
import React from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { useFetch } from '@/hooks/useFetch';
import { absUrl, nativeLink } from '@/lib/cms';
import { formatMoney } from '@/lib/format';
import { useApp } from '@/state/AppContext';
import { useCart, type FoodMode } from '@/state/CartContext';
import { colors, hexA, themed } from '@/theme';
import { AppText, OnDark } from '../../ui/AppText';
import { Touchable } from '../../ui/Button';
import { Skeleton } from '../../ui/StateView';
import type { SectionProps } from '../types';
import { bi, useFoodHome } from './FoodData';

const G = '#77BC1F';
const HERO_BG = 'https://images.unsplash.com/photo-1567620905732-2d1ec7ab7445?w=1600&h=700&fit=crop';
const MODES: [FoodMode, any, string, string][] = [['delivery', Bike, 'Livraison', 'Delivery'], ['pickup', ShoppingBag, 'À emporter', 'Pickup'], ['dine_in', Utensils, 'Sur place', 'Dine-in']];

export function FoodHero({ section }: SectionProps) {
  const { lang, address } = useApp();
  const { foodMode, setFoodMode } = useCart();
  const cfg = section.config || {};
  const sub = bi(section, 'subtitle', lang);
  return (
    <View testID={`cms-food-hero-${section.id}`} style={{ gap: 16 }}>
      <View style={styles.hero}><OnDark>
        <Image source={absUrl(cfg.background_image) || HERO_BG} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="memory-disk" transition={250} />
        <LinearGradient colors={['rgba(0,0,0,0.75)', 'rgba(0,0,0,0.3)', 'rgba(0,0,0,0.1)']} locations={[0, 0.6, 1]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={StyleSheet.absoluteFill} />
        <Touchable testID="cms-food-favourites" onPress={() => router.push('/food/favourites')} style={styles.fav}>
          <Heart color="#ef4444" fill="#ef4444" size={13} /><AppText size={12} weight="semibold">{lang === 'fr' ? 'Mes Favoris' : 'My favourites'}</AppText>
        </Touchable>
        <View style={{ padding: 22, gap: 14 }}>
          {cfg.eyebrow ? <AppText size={11} weight="semibold" color="rgba(255,255,255,0.7)" style={styles.caps}>{cfg.eyebrow}</AppText> : null}
          <AppText weight="bold" size={34} style={{ lineHeight: 40 }} testID="cms-food-hero-title">
            {bi(section, 'title', lang)}{sub ? <AppText weight="bold" size={34} color={G}>{`\n${sub}`}</AppText> : null}
          </AppText>
          <AppText size={14} color="rgba(255,255,255,0.8)">{bi(section, 'tagline', lang)}</AppText>
          <View style={styles.modes} testID="food-service-toggle">
            {MODES.map(([code, Icon, fr, en]) => {
              const on = foodMode === code;
              return (
                <Touchable key={code} testID={`food-mode-${code}`} onPress={() => setFoodMode(code)} style={[styles.mode, on && { backgroundColor: G, borderColor: G }]}>
                  <Icon color={on ? '#000' : '#fff'} size={14} /><AppText size={12} weight="semibold" color={on ? '#000' : '#fff'}>{lang === 'fr' ? fr : en}</AppText>
                </Touchable>
              );
            })}
          </View>
          {cfg.cta_label && cfg.cta_link ? <Touchable testID="cms-food-hero-cta" onPress={() => router.push(nativeLink(cfg.cta_link, 'food') as any)} style={[styles.mode, { backgroundColor: G, borderColor: G, alignSelf: 'flex-start' }]}>
            <AppText size={12} weight="semibold" color="#000">{cfg.cta_label}</AppText><ChevronRight color="#000" size={14} /></Touchable> : null}
        </View>
      </OnDark></View>
      {!address ? (
        <View style={styles.addr} testID="food-home-set-address">
          <MapPin color="#FCD34D" size={18} />
          <AppText size={13} color={colors.warnText} style={{ flex: 1 }}>{lang === 'fr' ? 'Choisissez votre adresse de livraison pour voir uniquement les restaurants qui livrent chez vous.' : 'Set your delivery address to see only restaurants that deliver to you.'}</AppText>
          <Touchable testID="food-home-set-address-btn" onPress={() => router.push('/address')} style={styles.addrBtn}><AppText size={12} weight="semibold" color="#000">{lang === 'fr' ? "Choisir l'adresse" : 'Set address'}</AppText></Touchable>
        </View>
      ) : null}
    </View>
  );
}

export function FoodHead({ title, subtitle, to, testID }: { title?: string; subtitle?: string; to?: string; testID: string }) {
  const { lang } = useApp();
  return (
    <View style={styles.head}>
      <View style={{ flex: 1 }}>
        <AppText weight="bold" size={20} testID={`${testID}-title`}>{title}</AppText>
        {subtitle ? <AppText size={12} color={colors.textMuted} style={{ marginTop: 4 }}>{subtitle}</AppText> : null}
      </View>
      {to ? <Touchable testID={`${testID}-view-all`} onPress={() => router.push(to as any)} style={styles.link}><AppText size={12} weight="semibold" color={G}>{lang === 'fr' ? 'Voir tout' : 'View All'}</AppText><ChevronRight color={G} size={14} /></Touchable> : null}
    </View>
  );
}

const Tile = ({ img, name, onPress, testID }: { img?: string; name: string; onPress: () => void; testID: string }) => (
  <Touchable testID={testID} onPress={onPress} style={styles.tile} scale={0.95}>
    <View style={styles.tileImg}>{img ? <Image source={img} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="memory-disk" /> : null}</View>
    <AppText size={11} weight="medium" align="center" numberOfLines={2}>{name}</AppText>
  </Touchable>
);

export function FoodCategories({ section }: SectionProps) {
  const { lang } = useApp();
  const { data } = useFoodHome();
  const pick = (c: any) => (lang === 'fr' ? c.name_fr || c.name_en : c.name_en || c.name_fr);
  return (
    <View testID={`cms-food-categories-${section.id}`}>
      <FoodHead testID="cms-food-categories" title={bi(section, 'title', lang) || (lang === 'fr' ? 'Choisissez votre repas' : 'Choose your meal')} subtitle={bi(section, 'subtitle', lang)} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 16 }}>
        {(data?.categories || []).map((c) => <Tile key={c.code} testID={`food-category-${c.code}`} img={c.image} name={pick(c)} onPress={() => c.code !== 'all' && router.push(`/food/discover?category=${c.code}` as any)} />)}
      </ScrollView>
    </View>
  );
}

export function FoodCuisines({ section }: SectionProps) {
  const { lang } = useApp();
  const { data } = useFoodHome();
  const limit = Number(section.config?.limit) || undefined;
  const xs = (data?.cuisines || []).slice(0, limit);
  return (
    <View testID={`cms-food-cuisines-${section.id}`}>
      <FoodHead testID="cms-food-cuisines" title={bi(section, 'title', lang) || "Cuisines You'll Love"} subtitle={bi(section, 'subtitle', lang)} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 16 }}>
        {xs.map((c) => <Tile key={c.code} testID={`food-cuisine-${c.code}`} img={c.image} name={lang === 'fr' ? c.name_fr || c.name_en : c.name_en || c.name_fr} onPress={() => router.push(`/food/discover?cuisines=${c.code}` as any)} />)}
      </ScrollView>
    </View>
  );
}

export function FoodTopBrands({ section }: SectionProps) {
  const { lang, country, address } = useApp();
  const { foodMode } = useCart();
  const q = `/food/brands/top?country=${country?.code || 'CI'}&mode=${foodMode}&limit=${section.config?.limit || 10}${address ? `&lat=${address.latitude}&lng=${address.longitude}` : ''}`;
  const { data, loading } = useFetch<{ items: any[] }>(q, [q]);
  const items = data?.items || [];
  if (!loading && !items.length && !address) return null;
  return (
    <View style={styles.brandsBox} testID={`cms-food-top-brands-${section.id}`}>
      <FoodHead testID="cms-food-top-brands" title={bi(section, 'title', lang)} subtitle={bi(section, 'subtitle', lang)} />
      {!loading && !items.length ? (
        <View style={styles.empty} testID="food-section-top-brands-empty"><MapPin color={colors.textMuted} size={14} />
          <AppText size={13} color={colors.textMuted} align="center" style={{ flex: 1 }}>{lang === 'fr' ? 'Aucune enseigne ne livre encore à votre adresse. Essayez une autre adresse ou le mode à emporter.' : 'No brands deliver to this address yet. Try another address or pickup mode.'}</AppText></View>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 20 }}>
          {loading ? [0, 1, 2, 3].map((i) => <Skeleton key={i} w={96} h={96} r={48} />) : items.map((b) => (
            <Touchable key={b.restaurant_id} testID={`top-brand-card-${b.restaurant_id}`} onPress={() => router.push(`/food/restaurant/${b.restaurant_id}` as any)} style={{ width: 112, alignItems: 'center', gap: 6 }}>
              <View style={styles.brandImg}>{b.image ? <Image source={absUrl(b.image)} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="memory-disk" /> : <AppText weight="bold" size={20} color="#666">{(b.brand || '?')[0]}</AppText>}</View>
              <AppText size={12} weight="semibold" numberOfLines={1}>{b.brand}</AppText>
              <View style={styles.row}><Clock color={colors.textMuted} size={10} /><AppText size={11} color={colors.textMuted}>{b.eta_min && b.eta_max ? `${b.eta_min}–${b.eta_max} min` : '— min'}</AppText></View>
            </Touchable>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

export function FoodFeatured({ section }: SectionProps) {
  const { lang, t, country } = useApp();
  const { foodMode } = useCart();
  const { data, loading } = useFoodHome();
  const cfg = section.config || {};
  let xs = data?.featured_restaurants || [];
  if (cfg.cuisine_filter) xs = xs.filter((r) => (r.cuisines || []).includes(cfg.cuisine_filter));
  if (cfg.limit) xs = xs.slice(0, Number(cfg.limit));
  const sym = country?.currency_symbol || 'CFA';
  const cuisineName = (code: string) => { const c = data?.cuisines?.find((x) => x.code === code); return c ? (lang === 'fr' ? c.name_fr || c.name_en : c.name_en || c.name_fr) : code.replace(/_/g, ' '); };
  return (
    <View testID={`cms-food-featured-${section.id}`}>
      <FoodHead testID={`cms-food-featured-head-${section.id}`} title={bi(section, 'title', lang) || 'Featured Restaurants'} subtitle={bi(section, 'subtitle', lang)} to="/food/discover" />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 16 }}>
        {loading ? [0, 1].map((i) => <Skeleton key={i} w={240} h={280} r={16} />) : !xs.length ? (
          <AppText size={13} color={colors.textMuted} testID={`cms-food-featured-empty-${section.id}`}>{foodMode === 'pickup' ? (lang === 'fr' ? 'Aucun restaurant à emporter à proximité.' : 'No pickup restaurants nearby.') : foodMode === 'dine_in' ? (lang === 'fr' ? 'Aucun restaurant avec réservation ouverte à proximité.' : 'No dine-in restaurants with open reservations nearby.') : (lang === 'fr' ? 'Aucun restaurant pour le moment.' : 'No restaurants match this category yet.')}</AppText>
        ) : xs.map((r) => {
          const dine = foodMode === 'dine_in' && r.reservations_enabled; const pick = foodMode === 'pickup' && (r.pickup_enabled || r.pickup_eligible);
          const cta = dine ? (lang === 'fr' ? 'Réserver une table' : 'Book a table') : pick ? (lang === 'fr' ? 'Commander à emporter' : 'Order pickup') : null;
          return (
            <Touchable key={r.id} testID={`food-restaurant-${r.id}`} onPress={() => router.push((dine ? `/food/reserve/${r.id}` : `/food/restaurant/${r.id}`) as any)} style={styles.card} scale={0.98}>
              <View style={styles.cardImg}>
                <Image source={absUrl(r.image)} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="memory-disk" />
                <View style={styles.eta}><Clock color="#fff" size={10} /><AppText size={10} weight="semibold" color="#fff">{r.eta_min && r.eta_max ? `${r.eta_min}–${r.eta_max} min` : `${r.prep_time_min}–${r.prep_time_max} min`}</AppText></View>
              </View>
              <View style={{ padding: 12, gap: 4 }}>
                <AppText size={14} weight="semibold" numberOfLines={1}>{r.name}</AppText>
                <AppText size={11} color={colors.textMuted} numberOfLines={1}>{(r.cuisines || []).slice(0, 2).map(cuisineName).join(' · ')}</AppText>
                <View style={styles.row}>
                  <Star color={G} fill={G} size={11} /><AppText size={11}>{Number(r.rating || 0).toFixed(1)}</AppText><AppText size={11} color={colors.textMuted}>({r.review_count})</AppText>
                  <View style={{ flex: 1 }} />
                  <View style={[styles.open, { backgroundColor: r.is_open ? hexA(G, 0.2) : colors.surface2 }]}><AppText size={10} weight="semibold" color={r.is_open ? G : colors.textMuted}>{r.is_open ? (lang === 'fr' ? 'Ouvert' : 'Open') : t('food.closed')}</AppText></View>
                </View>
                {cta ? <View style={styles.cta}><AppText size={11} weight="semibold" color="#000">{cta}</AppText></View>
                  : <AppText size={11} color={colors.textMuted} style={{ paddingTop: 4 }}>{r.delivery_fee === 0 ? t('food.free_delivery') : `${formatMoney(r.delivery_fee, undefined, sym, lang)} ${lang === 'fr' ? 'livraison' : 'delivery'}`}</AppText>}
              </View>
            </Touchable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = themed(() => StyleSheet.create({
  hero: { minHeight: 380, borderRadius: 20, overflow: 'hidden', justifyContent: 'center', backgroundColor: '#0a0a0a' },
  fav: { position: 'absolute', top: 14, right: 14, zIndex: 2, flexDirection: 'row', alignItems: 'center', gap: 6, height: 34, paddingHorizontal: 12, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.15)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)' },
  caps: { letterSpacing: 1.8, textTransform: 'uppercase' },
  modes: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  mode: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 40, paddingHorizontal: 16, borderRadius: 999, borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)', backgroundColor: 'rgba(0,0,0,0.45)' },
  addr: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderRadius: 16, borderWidth: 1, borderColor: 'rgba(251,191,36,0.4)', backgroundColor: 'rgba(245,158,11,0.1)' },
  addrBtn: { height: 36, paddingHorizontal: 12, borderRadius: 999, backgroundColor: '#F59E0B', justifyContent: 'center' },
  head: { flexDirection: 'row', alignItems: 'flex-end', gap: 12, marginBottom: 14 },
  link: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  tile: { width: 88, alignItems: 'center', gap: 6 },
  tileImg: { width: 88, height: 88, borderRadius: 24, overflow: 'hidden', borderWidth: 2, borderColor: colors.border, backgroundColor: colors.surface2 },
  brandsBox: { borderRadius: 24, padding: 18, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  brandImg: { width: 96, height: 96, borderRadius: 48, overflow: 'hidden', backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  empty: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 18 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  card: { width: 240, borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  cardImg: { width: '100%', aspectRatio: 4 / 3, backgroundColor: colors.surface2 },
  eta: { position: 'absolute', top: 8, left: 8, flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(0,0,0,0.7)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999 },
  open: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999 },
  cta: { marginTop: 8, height: 32, borderRadius: 999, backgroundColor: G, alignItems: 'center', justifyContent: 'center' },
}));
