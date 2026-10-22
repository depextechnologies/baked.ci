import { router } from 'expo-router';
import { ArrowRight } from 'lucide-react-native';
import React from 'react';
import { StyleSheet, View } from 'react-native';

import { useApp } from '@/state/AppContext';
import { colors } from '@/theme';
import { AppText } from '../ui/AppText';
import { Touchable } from '../ui/Button';

// Section title + subtitle with the accent "Voir tout →" link, as on the website.
export function SectionHeader({ title, subtitle, accent, to, testID }: { title?: string; subtitle?: string; accent: string; to?: string; testID: string }) {
  const { t } = useApp();
  if (!title && !subtitle) return null;
  return (
    <View style={styles.row}>
      <View style={{ flex: 1 }}>
        {title ? <AppText weight="semibold" size={20} testID={`${testID}-title`}>{title}</AppText> : null}
        {subtitle ? <AppText size={13} color={colors.textMuted} style={{ marginTop: 3 }} testID={`${testID}-subtitle`}>{subtitle}</AppText> : null}
      </View>
      {to ? (
        <Touchable testID={`${testID}-view-all`} onPress={() => router.push(to as any)} style={styles.link} hitSlop={8}>
          <AppText size={12} weight="semibold" color={accent}>{t('cms.view_all')}</AppText><ArrowRight color={accent} size={12} />
        </Touchable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: 10, marginBottom: 14 },
  link: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingBottom: 3 },
});
