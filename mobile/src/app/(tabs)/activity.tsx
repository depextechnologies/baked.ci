import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BrandName } from '@/components/BrandName';
import { ModuleIcon } from '@/components/ModuleIcon';
import { AppText } from '@/components/ui/AppText';
import { Touchable } from '@/components/ui/Button';
import { ErrorView, Skeleton, StateView } from '@/components/ui/StateView';
import { api } from '@/lib/api';
import { formatDate, formatMoney } from '@/lib/format';
import { statusLabel } from '@/lib/i18n';
import { MODULES, type ModuleCode } from '@/lib/modules';
import { useApp } from '@/state/AppContext';
import { useSession } from '@/state/SessionContext';
import { colors, hexA, radius } from '@/theme';

type Entry = { key: string; module: ModuleCode; ref: string; status: string; total: number | null; currency: string; at: string | null };

const SOURCES: { module: ModuleCode; path: string }[] = [
  { module: 'mart', path: '/orders/me' },
  { module: 'food', path: '/food/customer/orders' },
  { module: 'shop', path: '/shop/orders/me' },
  { module: 'express', path: '/express/bookings/mine' },
];
const DONE = ['delivered', 'completed', 'cancelled', 'canceled', 'refunded', 'rejected', 'failed'];

const normalise = (module: ModuleCode, data: any): Entry[] => {
  const list: any[] = Array.isArray(data) ? data : data?.items || data?.orders || data?.bookings || [];
  return list.map((o) => ({
    key: `${module}-${o.id}`, module, ref: o.number || o.reference || o.code || String(o.id).slice(-8),
    status: o.status || '', total: o.total ?? o.grand_total ?? o.total_amount ?? o.fare ?? o.price ?? null,
    currency: o.currency || 'XOF', at: o.created_at || null,
  }));
};

export default function Activity() {
  const { t, lang } = useApp();
  const { isAuthed } = useSession();
  const [items, setItems] = useState<Entry[] | null>(null);
  const [error, setError] = useState(false);
  const [mod, setMod] = useState<ModuleCode | 'all'>('all');
  const [phase, setPhase] = useState<'all' | 'active' | 'past'>('all');

  const load = useCallback(async () => {
    if (!isAuthed) return;
    setError(false);
    const res = await Promise.allSettled(SOURCES.map((s) => api(s.path).then((d) => normalise(s.module, d))));
    if (res.every((r) => r.status === 'rejected')) { setError(true); return; }
    const all = res.flatMap((r) => (r.status === 'fulfilled' ? r.value : []));
    setItems(all.sort((a, b) => (b.at || '').localeCompare(a.at || '')));
  }, [isAuthed]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const shown = (items || []).filter((e) => (mod === 'all' || e.module === mod)
    && (phase === 'all' || (phase === 'past' ? DONE.includes(e.status) : !DONE.includes(e.status))));

  return (
    <SafeAreaView edges={['top']} style={styles.root} testID="activity-screen">
      <AppText weight="black" size={28} style={styles.title}>{t('activity.title')}</AppText>
      {!isAuthed ? (
        <StateView testID="activity-login-required" title={t('common.login_required')} action={{ label: t('common.login'), onPress: () => router.push('/login?redirect=/activity') }} />
      ) : (
        <>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters} style={{ flexGrow: 0 }}>
            {(['all', 'mart', 'food', 'shop', 'express'] as const).map((f) => (
              <Touchable key={f} testID={`activity-filter-${f}`} onPress={() => setMod(f)} style={[styles.chip, mod === f && styles.chipOn]}>
                {f === 'all' ? <AppText weight="semibold" size={13}>{t('activity.all')}</AppText> : <BrandName code={f} size={13} />}
              </Touchable>
            ))}
            {(['active', 'past'] as const).map((p) => (
              <Touchable key={p} testID={`activity-phase-${p}`} onPress={() => setPhase(phase === p ? 'all' : p)} style={[styles.chip, phase === p && styles.chipOn]}>
                <AppText weight="semibold" size={13}>{p === 'active' ? statusLabel(lang, 'out_for_delivery') : statusLabel(lang, 'completed')}</AppText>
              </Touchable>
            ))}
          </ScrollView>
          <ScrollView contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: 30, gap: 10 }}
            refreshControl={<RefreshControl refreshing={false} onRefresh={load} tintColor="#fff" />}>
            {error ? <ErrorView onRetry={load} /> : items == null ? [0, 1, 2].map((i) => <Skeleton key={i} h={78} />)
              : shown.length === 0 ? <StateView testID="activity-empty" title={t('activity.empty')} body={t('activity.empty_sub')} />
                : shown.map((e) => <Row key={e.key} e={e} lang={lang} />)}
          </ScrollView>
        </>
      )}
    </SafeAreaView>
  );
}

function Row({ e, lang }: { e: Entry; lang: 'fr' | 'en' }) {
  const m = MODULES[e.module];
  const done = DONE.includes(e.status);
  return (
    <View style={styles.row} testID={`activity-item-${e.key}`}>
      <View style={[styles.icon, { backgroundColor: hexA(m.color, 0.16) }]}><ModuleIcon icon={m.icon} color={m.color} size={20} /></View>
      <View style={{ flex: 1 }}>
        <BrandName code={e.module} size={14} />
        <AppText size={12} color={colors.textMuted}>#{e.ref} · {formatDate(e.at, lang)}</AppText>
      </View>
      <View style={{ alignItems: 'flex-end', gap: 4 }}>
        {e.total != null ? <AppText weight="bold" size={14}>{formatMoney(Number(e.total), e.currency, undefined, lang)}</AppText> : null}
        <View style={[styles.status, { backgroundColor: done ? colors.surface2 : hexA(m.color, 0.18) }]}>
          <AppText weight="semibold" size={11} color={done ? colors.textMuted : m.color}>{statusLabel(lang, e.status)}</AppText>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  title: { paddingHorizontal: 18, paddingTop: 8, paddingBottom: 4, letterSpacing: -0.6 },
  filters: { gap: 8, paddingHorizontal: 18, paddingVertical: 14 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  chipOn: { borderColor: colors.text, backgroundColor: colors.surface2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  icon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  status: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.pill },
});
