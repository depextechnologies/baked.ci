import { router, useLocalSearchParams } from 'expo-router';
import { Image } from 'expo-image';
import { ArrowRight, Package, Search, X } from 'lucide-react-native';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BrandName } from '@/components/BrandName';
import { ModuleIcon } from '@/components/ModuleIcon';
import { AppText } from '@/components/ui/AppText';
import { Touchable } from '@/components/ui/Button';
import { ErrorView } from '@/components/ui/StateView';
import { useModuleNav } from '@/hooks/useModuleNav';
import { api } from '@/lib/api';
import { ModuleExplore } from '@/components/explore/ModuleExplore';
import { MODULES, SWITCHER_ORDER, type ModuleCode } from '@/lib/modules';
import { useApp } from '@/state/AppContext';
import { colors, fonts, hexA, radius, themed } from '@/theme';

type Hit = { module: string; entity_type: string; entity_id?: string; title: string; subtitle?: string; image?: string; destination_url?: string };
type Intent = { intent_code: string; module: string; action_label: string; subtitle?: string };
type Result = { groups: { module: string; items: Hit[] }[]; detected_intents: Intent[]; suggestions: string[]; event_id: string | null };

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
  const input = useRef<any>(null);

  useEffect(() => { if (focus) setTimeout(() => input.current?.focus(), 250); }, [focus]);
  useEffect(() => { if (activeContext !== 'baked') setFilter(activeContext); }, [activeContext]);

  const run = React.useCallback(async () => {
    if (q.trim().length < 2) { setRes(null); return; }
    setLoading(true); setError(false);
    const mod = filter === 'all' ? '' : `&module=${filter === 'express' ? 'send' : filter}`;
    try {
      setRes(await api<Result>(`/search?q=${encodeURIComponent(q)}&country=${country?.code || 'CI'}&language=${lang}&limit=8${mod}`));
    } catch { setError(true); } finally { setLoading(false); }
  }, [q, filter, country?.code, lang]);

  useEffect(() => { const id = setTimeout(run, 300); return () => clearTimeout(id); }, [run]);

  const open = (m: string, hit?: Hit) => {
    if (hit && res?.event_id) api('/search/click', { method: 'POST', body: { event_id: res.event_id, module: m, entity_type: hit.entity_type, entity_id: hit.entity_id || hit.title } }).catch(() => {});
    const code = toCode(m);
    openModule(code);
    const target = hit?.entity_id || hit?.destination_url?.split('?')[0].split('/').filter(Boolean).pop();
    if (target && code === 'mart' && hit?.entity_type === 'product') router.push(`/mart/product/${target}`);
    else if (target && code === 'food' && hit?.entity_type === 'restaurant') router.push(`/food/restaurant/${target}`);
  };

  const empty = res && res.groups.length === 0 && res.detected_intents.length === 0;

  return (
    <SafeAreaView edges={['top']} style={styles.root} testID="explore-screen">
      <AppText weight="black" size={28} style={styles.title}>{t('explore.title')}</AppText>
      <View style={styles.search}>
        <Search color={colors.textMuted} size={20} />
        <TextInput ref={input} testID="explore-search-input" value={q} onChangeText={setQ} placeholder={activeContext !== 'baked' ? `${t('home.search_ph')} · ${MODULES[activeContext].label}` : t('explore.ph')}
          placeholderTextColor={colors.textDim} style={styles.input} autoCorrect={false} returnKeyType="search" />
        {loading ? <ActivityIndicator color={colors.text} /> : q ? (
          <Touchable testID="explore-clear" onPress={() => setQ('')} hitSlop={8}><X color={colors.textMuted} size={18} /></Touchable>
        ) : null}
      </View>
      {activeContext !== 'baked' ? <View style={styles.filters} testID="explore-module-head"><BrandName code={activeContext} size={15} /></View> : (
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters} style={{ flexGrow: 0 }}>
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
        {!res && !error ? (activeContext !== 'baked' ? <ModuleExplore code={activeContext} /> : <Discover onTry={setQ} onOpen={(c) => openModule(c)} />) : null}
        {res?.detected_intents.map((it) => {
          const m = MODULES[toCode(it.module)];
          return (
            <Touchable key={it.intent_code} testID={`explore-intent-${it.intent_code}`} onPress={() => open(it.module)} style={[styles.intent, { borderColor: hexA(m.color, 0.5) }]}>
              <View style={[styles.iconBox, { backgroundColor: hexA(m.color, 0.18) }]}><Package color={m.color} size={20} /></View>
              <View style={{ flex: 1 }}>
                <AppText weight="bold" size={15}>{it.action_label}</AppText>
                {it.subtitle ? <AppText size={12} color={colors.textMuted}>{it.subtitle}</AppText> : null}
              </View>
              <ArrowRight color={m.color} size={18} />
            </Touchable>
          );
        })}
        {res?.groups.map((g) => (
          <View key={g.module} style={{ marginTop: 18 }} testID={`explore-group-${toCode(g.module)}`}>
            <View style={styles.groupHead}><BrandName code={toCode(g.module)} size={16} /></View>
            {g.items.map((h, i) => (
              <Touchable key={`${h.title}-${i}`} testID={`explore-hit-${toCode(g.module)}-${i}`} onPress={() => open(g.module, h)} style={styles.hit} scale={0.99}>
                <View style={styles.thumb}>{h.image ? <Image source={h.image} style={StyleSheet.absoluteFill} contentFit="cover" /> : null}</View>
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
            {res!.suggestions.map((s) => (
              <Touchable key={s} testID="explore-suggestion" onPress={() => setQ(s)}><AppText weight="semibold" color={colors.accent}>{t('explore.did_you_mean', { q: s })}</AppText></Touchable>
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
}));
