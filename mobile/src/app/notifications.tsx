import { Redirect, useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText } from '@/components/ui/AppText';
import { Touchable } from '@/components/ui/Button';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { ErrorView, Skeleton, StateView } from '@/components/ui/StateView';
import { api } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { useApp } from '@/state/AppContext';
import { useSession } from '@/state/SessionContext';
import { colors, radius, themed } from '@/theme';

type Notif = { id: string; title: string; body?: string; is_read: boolean; created_at: string };

export default function Notifications() {
  const { t, lang } = useApp();
  const { isAuthed } = useSession();
  const [items, setItems] = useState<Notif[] | null>(null);
  const [error, setError] = useState(false);

  const load = useCallback(() => {
    setError(false);
    api<{ items: Notif[] }>('/customers/me/notifications').then((r) => setItems(r.items)).catch(() => setError(true));
  }, []);
  useFocusEffect(useCallback(() => { if (isAuthed) load(); }, [isAuthed, load]));
  if (!isAuthed) return <Redirect href="/login?redirect=/notifications" />;

  const readAll = async () => { await api('/customers/me/notifications/read-all', { method: 'POST' }).catch(() => {}); load(); };

  return (
    <SafeAreaView style={styles.root} testID="notifications-screen">
      <ScreenHeader title={t('notif.title')} right={items?.some((n) => !n.is_read) ? (
        <Touchable testID="notifications-read-all" onPress={readAll}><AppText weight="semibold" size={13} color={colors.accent}>{t('notif.read_all')}</AppText></Touchable>
      ) : undefined} />
      <ScrollView contentContainerStyle={{ padding: 18, gap: 10 }}>
        {error ? <ErrorView onRetry={load} /> : items == null ? [0, 1, 2].map((i) => <Skeleton key={i} h={70} />)
          : items.length === 0 ? <StateView testID="notifications-empty" title={t('notif.empty')} />
            : items.map((n) => (
              <View key={n.id} style={[styles.card, !n.is_read && { borderColor: colors.accent }]}>
                <AppText weight="semibold" size={15}>{n.title}</AppText>
                {n.body ? <AppText size={13} color={colors.textMuted}>{n.body}</AppText> : null}
                <AppText size={11} color={colors.textDim}>{formatDate(n.created_at, lang)}</AppText>
              </View>
            ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = themed(() => StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  card: { padding: 14, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, gap: 4 },
}));
