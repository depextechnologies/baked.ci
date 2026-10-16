import { CloudOff, Inbox } from 'lucide-react-native';
import React from 'react';
import { StyleSheet, View } from 'react-native';

import { useApp } from '@/state/AppContext';
import { colors, radius } from '@/theme';
import { AppText } from './AppText';
import { Button } from './Button';

type Props = { title: string; body?: string; action?: { label: string; onPress: () => void }; kind?: 'empty' | 'error'; testID?: string };

export function StateView({ title, body, action, kind = 'empty', testID }: Props) {
  const Icon = kind === 'error' ? CloudOff : Inbox;
  return (
    <View style={styles.wrap} testID={testID}>
      <View style={styles.icon}><Icon color={colors.textMuted} size={26} /></View>
      <AppText weight="semibold" size={16} align="center">{title}</AppText>
      {body ? <AppText size={13} color={colors.textMuted} align="center">{body}</AppText> : null}
      {action ? <View style={{ marginTop: 8, alignSelf: 'stretch' }}><Button variant="secondary" label={action.label} onPress={action.onPress} /></View> : null}
    </View>
  );
}

export function ErrorView({ onRetry }: { onRetry: () => void }) {
  const { t } = useApp();
  return <StateView kind="error" testID="error-state" title={t('common.network_error')} action={{ label: t('common.retry'), onPress: onRetry }} />;
}

export function Skeleton({ h, w = '100%', r = radius.md }: { h: number; w?: number | `${number}%`; r?: number }) {
  return <View style={{ height: h, width: w, borderRadius: r, backgroundColor: colors.surface2 }} />;
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: 8, paddingVertical: 40, paddingHorizontal: 24 },
  icon: { width: 56, height: 56, borderRadius: 28, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
});
