import { router } from 'expo-router';
import { ArrowLeft, Check, Moon, Smartphone, Sun } from 'lucide-react-native';
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText } from '@/components/ui/AppText';
import { Touchable } from '@/components/ui/Button';
import type { TKey } from '@/lib/i18n';
import { useApp } from '@/state/AppContext';
import { useThemeMode, type ThemeMode } from '@/state/ThemeContext';
import { colors, radius, themed } from '@/theme';

const OPTIONS: { mode: ThemeMode; icon: typeof Moon }[] = [
  { mode: 'dark', icon: Moon },
  { mode: 'light', icon: Sun },
  { mode: 'system', icon: Smartphone },
];

export default function Appearance() {
  const { t } = useApp();
  const { mode, setMode } = useThemeMode();
  return (
    <SafeAreaView edges={['top']} style={styles.root} testID="appearance-screen">
      <View style={styles.head}>
        <Touchable testID="appearance-back" onPress={() => (router.canGoBack() ? router.back() : router.navigate('/profile'))} style={styles.back} hitSlop={8}>
          <ArrowLeft color={colors.text} size={22} />
        </Touchable>
        <AppText weight="black" size={24}>{t('theme.title')}</AppText>
      </View>
      <AppText size={14} color={colors.textMuted} style={styles.sub}>{t('theme.sub')}</AppText>
      <View style={styles.list}>
        {OPTIONS.map(({ mode: m, icon: Icon }, i) => {
          const on = m === mode;
          return (
            <Touchable key={m} testID={`appearance-option-${m}`} accessibilityRole="radio" accessibilityState={{ checked: on }}
              onPress={() => setMode(m)} scale={0.99} style={[styles.item, i > 0 && styles.divider]}>
              <View style={[styles.icon, on && { backgroundColor: colors.accent }]}><Icon color={on ? '#000' : colors.text} size={20} /></View>
              <View style={{ flex: 1 }}>
                <AppText weight="semibold" size={16}>{t(`theme.${m}` as TKey)}</AppText>
                <AppText size={13} color={colors.textMuted}>{t(`theme.${m}_sub` as TKey)}</AppText>
              </View>
              <View style={[styles.radio, on && styles.radioOn]} testID={on ? `appearance-selected-${m}` : undefined}>
                {on ? <Check color="#000" size={14} strokeWidth={3} /> : null}
              </View>
            </Touchable>
          );
        })}
      </View>
    </SafeAreaView>
  );
}

const styles = themed(() => StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 18, paddingTop: 8 },
  back: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  sub: { paddingHorizontal: 18, marginTop: 12, marginBottom: 20 },
  list: { marginHorizontal: 18, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  item: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, minHeight: 72 },
  divider: { borderTopWidth: 1, borderTopColor: colors.borderSoft },
  icon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface2 },
  radio: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  radioOn: { backgroundColor: colors.accent, borderColor: colors.accent },
}));
