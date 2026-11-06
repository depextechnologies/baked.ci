import { router, useLocalSearchParams } from 'expo-router';
import { ArrowRight, Package, Search, X } from 'lucide-react-native';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BrandName } from '@/components/BrandName';
import { ModuleIcon } from '@/components/ModuleIcon';
import { AppText } from '@/components/ui/AppText';
import { Touchable } from '@/components/ui/Button';
import { SafeImage } from '@/components/ui/SafeImage';
import { ErrorView } from '@/components/ui/StateView';
import { useModuleNav } from '@/hooks/useModuleNav';
import { api } from '@/lib/api';
import { ModuleExplore } from '@/components/explore/ModuleExplore';
import { MODULES, SWITCHER_ORDER, type ModuleCode } from '@/lib/modules';
import { useApp } from '@/state/AppContext';
import { accentText, colors, fonts, hexA, radius, themed } from '@/theme';

type Hit = { module: string; entity_type: string; entity_id?: string; title: string; subtitle?: string; image?: string; destination_url?: string };
type Intent = { intent_code: string; module: string; action_label: string; subtitle?: string; destination?: string };
type Result = { groups: { module: string; items: Hit[] }[]; detected_intents: Intent[]; suggestions: string[]; event_id: string | null; query?: string; corrected_from?: string };

const toCode = (m: string): ModuleCode => (m === 'send' ? 'express' : (m as ModuleCode));
const FILTERS: (ModuleCode | 'all')[] = ['all', 'mart', 'food', 'shop', 'express'];
const TRY = ['Lait', 'Pizza', 'Sneakers', 'Envoyer un colis'];

export default function Explore() {
  const { focus } = useLocalSearchParams<{ focus?: string }>();
  const { t, lang, country, activeContext } = useApp();
  const { openModule } = useModuleNav();
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<ModuleCode | 'all'>('all');
  const [res, setRes] = useState<Result | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [unscoped, setUnscoped] = useState(false);
  const input = useRef<any>(null);
  const seq = useRef(0);
  const scoped = activeContext !== 'baked' && !unscoped;

  useEffect(() => { if (focus) setTimeout(() => input.current?.focus(), 250); }, [focus]);
  useEffect(() => { setUnscoped(false); setFilter(activeContext !== 'baked' ? activeContext : 'all'); }, [activeContext]);

  // Each search gets a sequence number so a slow, older response can never overwrite newer (or cleared) results.
  const run = React.useCallback(async () => {
    const id = ++seq.current;
    if (q.trim().length < 2) { setRes(null); setLoading(false); setError(false); return; }
    setLoading(true); setError(false);
    const mod = filter === 'all' ? '' : `&module=${filter === 'express' ? 'send' : filter}`;
    try {
      const r = await api<Result>(`/search?q=${encodeURIComponent(q.trim())}&country=${country?.code || 'CI'}&language=${lang}&limit=8${mod}`);
      if (id === seq.current) setRes(r);
    } catch { if (id === seq.current) setError(true); } finally { if (id === seq.current) setLoading(false); }
  }, [q, filter, country?.code, lang]);

  useEffect(() => { const id = setTimeout(run, 300); return () => clearTimeout(id); }, [run]);

  const clear = () => { seq.current++; setQ(''); setRes(null); setError(false); setLoading(false); input.current?.focus(); };
  const searchAll = () => { setUnscoped(true); setFilter('all'); };

  const open = (m: string, hit?: Hit) => {
    if (hit && res?.event_id) api('/search/click', { method: 'POST', body: { event_id: res.event_id, module: m, entity_type: hit.entity_type, entity_id: hit.entity_id || hit.title } }).catch(() => {});
    const code = toCode(m);
    openModule(code);
    const url = hit?.destination_url || '';
    const [path, qs = ''] = url.split('?');
    const target = hit?.entity_id || path.split('/').filter(Boolean).pop();
    const param = (k: string) => new URLSearchParams(qs).get(k);
    const type = hit?.entity_type;
    if (target && code === 'mart' && type === 'product') router.push(`/mart/product/${target}`);
    else if (target && code === 'food' && type === 'restaurant') router.push(`/food/restaurant/${target}` as any);
    else if (target && code === 'food' && type === 'dish') router.push(`/food/restaurant/${target}${param('item') ? `?item=${encodeURIComponent(param('item')!)}` : ''}` as any);
    else if (code === 'food' && type === 'cuisine') router.push(`/food/discover?q=${encodeURIComponent(param('q') || res?.query || q)}` as any);
    else if (target && code === 'shop' && type === 'product') router.push(`/shop/product/${target}`);
    else if (target && code === 'shop' && type === 'category') router.push(`/shop/category/${target}` as any);
    else if (code === 'shop' && type === 'brand' && param('brand')) router.push(`/shop/category/all?brand=${encodeURIComponent(param('brand')!)}` as any);
  };

  const openIntent = (it: Intent) => {
    const code = toCode(it.module);
    openModule(code);
    const d = it.destination || '';
    if (code === 'express') router.push((/mover|shift|demenag/.test(d) ? '/send/movers' : '/send/book') as any);
  };

  const empty = res && res.groups.length === 0 && res.detected_intents.length === 0;

  return (
    <SafeAreaView edges={['top']} style={styles.root} testID="explore-screen">
      <AppText weight="black" size={28} style={styles.title}>{t('explore.title')}</AppText>
      <View style={styles.search}>
        <Search color={colors.textMuted} size={20} />
        <TextInput ref={input} testID="explore-search-input" value={q} onChangeText={setQ} placeholder={scoped ? `${t('home.search_ph')} · ${MODULES[activeContext as ModuleCode].label}` : t('explore.ph')}
          placeholderTextColor={colors.textDim} style={styles.input} autoCorrect={false} returnKeyType="search" onSubmitEditing={run} />
        {loading ? <ActivityIndicator color={colors.text} testID="explore-loading" /> : null}
        {q ? (
          <Touchable testID="explore-clear" accessibilityLabel={t('explore.clear')} onPress={clear} hitSlop={10}><X color={colors.textMuted} size={18} /></Touchable>
        ) : null}
      </View>
      {scoped ? (
        <View style={[styles.filters, styles.scopeRow]} testID="explore-module-head">
          <BrandName code={activeContext as ModuleCode} size={15} />
          <Touchable testID="explore-search-all" onPress={searchAll} style={styles.chip} hitSlop={6}>
            <AppText size={13} weight="semibold">{t('explore.search_all')}</AppText>
          </Touchable>
        </View>
      ) : (
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters} style={{ flexGrow: 0, flexShrink: 0, minHeight: 52 }}>
        {FILTERS.map((f) => {
          const on = filter === f;
          const c = f === 'all' ? colors.text : MODULES[f].color;
          return (
            <Touchable key={f} testID={`explore-filter-${f}`} onPress={() => setFilter(f)} style={[styles.chip, on && { backgroundColor: hexA(c, 0.16), borderColor: c }]}>
              {f === 'all' ? <AppText weight="semibold" size={13}>{t('activity.all')}</AppText> : <BrandName code={f} size={13} />}
            </Touchable>
          );
        })}
      </ScrollView>
      )}

      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 30 }}>
        {error ? <ErrorView onRetry={run} /> : null}
        {!res && !error ? (scoped ? <ModuleExplore code={activeContext as ModuleCode} /> : <Discover onTry={setQ} onOpen={(c) => openModule(c)} />) : null}
        {res?.detected_intents.map((it) => {
          const m = MODULES[toCode(it.module)];
          return (
            <Touchable key={it.intent_code} testID={`explore-intent-${it.intent_code}`} onPress={() => openIntent(it)} style={[styles.intent, { borderColor: hexA(m.color, 0.5) }]}>
              <View style={[styles.iconBox, { backgroundColor: hexA(m.color, 0.18) }]}><Package color={m.color} size={20} /></View>
              <View style={{ flex: 1 }}>
                <AppText weight="bold" size={15}>{it.action_label}</AppText>
                {it.subtitle ? <AppText size={12} color={colors.textMuted}>{it.subtitle}</AppText> : null}
              </View>
              <ArrowRight color={m.color} size={18} />
            </Touchable>
          );
        })}
        {res?.corrected_from ? <AppText size={13} color={colors.textMuted} style={{ marginHorizontal: 18, marginTop: 10 }} testID="explore-corrected">{t('explore.showing_for', { q: res.query || '' })}</AppText> : null}
        {res?.groups.map((g) => (
          <View key={g.module} style={{ marginTop: 18 }} testID={`explore-group-${toCode(g.module)}`}>
            <View style={styles.groupHead}><BrandName code={toCode(g.module)} size={16} /></View>
            {g.items.map((h, i) => (
              <Touchable key={`${h.title}-${i}`} testID={`explore-hit-${toCode(g.module)}-${i}`} onPress={() => open(g.module, h)} style={styles.hit} scale={0.99}>
                <View style={styles.thumb}>
                  <SafeImage source={h.image} style={StyleSheet.absoluteFill} contentFit="cover"
                    fallback={<View style={[StyleSheet.absoluteFill, styles.thumbFb]}><ModuleIcon icon={MODULES[toCode(g.module)].icon} color={MODULES[toCode(g.module)].color} size={22} /></View>} />
                </View>
                <View style={{ flex: 1 }}>
                  <AppText weight="semibold" size={15} numberOfLines={1}>{h.title}</AppText>
                  {h.subtitle ? <AppText size={12} color={colors.textMuted} numberOfLines={1}>{h.subtitle}</AppText> : null}
                </View>
              </Touchable>
            ))}
          </View>
        ))}
        {empty ? (
          <View style={{ padding: 24, alignItems: 'center', gap: 10 }} testID="explore-empty">
            <AppText size={15} color={colors.textMuted} align="center">{t('explore.empty', { q })}</AppText>
            {filter !== 'all' ? <Touchable testID="explore-search-everywhere" onPress={searchAll}><AppText weight="semibold" color={accentText(colors.accent)}>{t('explore.everywhere')}</AppText></Touchable> : null}
            {res!.suggestions.map((s) => (
              <Touchable key={s} testID={`explore-suggestion-${s}`} onPress={() => setQ(s)}><AppText weight="semibold" color={accentText(colors.accent)}>{t('explore.did_you_mean', { q: s })}</AppText></Touchable>
            ))}
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function Discover({ onTry, onOpen }: { onTry: (q: string) => void; onOpen: (c: ModuleCode) => void }) {
  const { t } = useApp();
  return (
    <View testID="explore-discover">
      <AppText weight="semibold" size={12} color={colors.textMuted} style={styles.caption}>{t('explore.try').toUpperCase()}</AppText>
      <View style={styles.tryRow}>
        {TRY.map((s) => (
          <Touchable key={s} testID={`explore-try-${s}`} onPress={() => onTry(s)} style={styles.chip}><AppText size={13}>{s}</AppText></Touchable>
        ))}
      </View>
      <AppText weight="semibold" size={12} color={colors.textMuted} style={styles.caption}>{t('explore.services').toUpperCase()}</AppText>
      {SWITCHER_ORDER.filter((c) => MODULES[c].status === 'active').map((c) => (
        <Touchable key={c} testID={`explore-service-${c}`} onPress={() => onOpen(c)} style={styles.hit} scale={0.99}>
          <View style={[styles.iconBox, { backgroundColor: hexA(MODULES[c].color, 0.16) }]}><ModuleIcon icon={MODULES[c].icon} color={MODULES[c].color} size={20} /></View>
          <View style={{ flex: 1 }}>
            <BrandName code={c} size={16} />
            <AppText size={12} color={colors.textMuted}>{t(`mod.${c}.desc` as any)}</AppText>
          </View>
          <ArrowRight color={colors.textMuted} size={18} />
        </Touchable>
      ))}
    </View>
  );
}

const styles = themed(() => StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  title: { paddingHorizontal: 18, paddingTop: 8, paddingBottom: 12, letterSpacing: -0.6 },
  search: { flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: 18, paddingHorizontal: 16, height: 54, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  input: { flex: 1, minWidth: 0, color: colors.text, fontFamily: fonts.regular, fontSize: 16, height: '100%', outlineStyle: 'none' } as any,
  filters: { gap: 8, paddingHorizontal: 18, paddingVertical: 14 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  caption: { paddingHorizontal: 18, marginTop: 10, marginBottom: 10, letterSpacing: 1 },
  tryRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 18, marginBottom: 12 },
  intent: { flexDirection: 'row', alignItems: 'center', gap: 12, marginHorizontal: 18, marginTop: 6, padding: 14, borderRadius: radius.md, borderWidth: 1, backgroundColor: colors.surface },
  iconBox: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  groupHead: { paddingHorizontal: 18, marginBottom: 6 },
  hit: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 18, paddingVertical: 10 },
  thumb: { width: 52, height: 52, borderRadius: 12, overflow: 'hidden', backgroundColor: colors.surface2 },
  thumbFb: { alignItems: 'center', justifyContent: 'center' },
  scopeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
}));
