import React from 'react';
import { StyleSheet, View } from 'react-native';

import { useApp } from '@/state/AppContext';
import { colors, radius, themed } from '@/theme';
import { AppText } from './ui/AppText';
import { Touchable } from './ui/Button';

export function LangToggle() {
  const { lang, setLang } = useApp();
  return (
    <View style={styles.wrap} testID="lang-toggle">
      {(['fr', 'en'] as const).map((l) => (
        <Touchable key={l} testID={`lang-${l}`} onPress={() => setLang(l)} style={[styles.pill, lang === l && styles.on]}>
          <AppText weight="bold" size={12} color={lang === l ? '#000' : colors.textMuted}>{l.toUpperCase()}</AppText>
        </Touchable>
      ))}
    </View>
  );
}

const styles = themed(() => StyleSheet.create({
  wrap: { flexDirection: 'row', backgroundColor: colors.surface2, borderRadius: radius.pill, padding: 3, borderWidth: 1, borderColor: colors.border },
  pill: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.pill },
  on: { backgroundColor: colors.text },
}));
