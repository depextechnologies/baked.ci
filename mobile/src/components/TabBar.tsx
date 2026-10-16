import { Compass, House, LayoutGrid, Receipt, User } from 'lucide-react-native';
import React from 'react';
import { StyleSheet, View } from 'react-native';

import { MODULES } from '@/lib/modules';
import { useApp } from '@/state/AppContext';
import { useSwitcher } from '@/state/SwitcherContext';
import { colors } from '@/theme';
import { AppText } from './ui/AppText';
import { Touchable } from './ui/Button';

const ITEMS = [
  { name: 'index', icon: House, label: 'tab.home' },
  { name: 'explore', icon: Compass, label: 'tab.explore' },
  { name: 'switcher', icon: LayoutGrid, label: 'tab.switcher' },
  { name: 'activity', icon: Receipt, label: 'tab.activity' },
  { name: 'profile', icon: User, label: 'tab.profile' },
] as const;

type Props = { state: { index: number; routes: { key: string; name: string }[] }; navigateToTab: (key: string) => void; insets: { bottom: number } };

export function TabBar({ state, navigateToTab, insets }: Props) {
  const { t, activeContext } = useApp();
  const { open } = useSwitcher();
  const accent = activeContext === 'baked' ? colors.accent : MODULES[activeContext].color;
  const current = state.routes[state.index]?.name;

  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 10) }]} testID="tab-bar">
      {ITEMS.map(({ name, icon: Icon, label }) => {
        const route = state.routes.find((r) => r.name === name);
        if (name === 'switcher') {
          return (
            <View key={name} style={styles.item}>
              <Touchable testID="tab-switcher" accessibilityRole="button" accessibilityLabel={t(label)} onPress={open} style={[styles.fab, { borderColor: accent }]} scale={0.92}>
                <Icon color={colors.text} size={24} />
              </Touchable>
              <AppText size={11} weight="medium" color={colors.textMuted} style={{ marginTop: 4 }}>{t(label)}</AppText>
            </View>
          );
        }
        const focused = current === name;
        const tint = focused ? accent : colors.textMuted;
        return (
          <Touchable key={name} testID={`tab-${name === 'index' ? 'home' : name}`} accessibilityRole="tab" accessibilityState={{ selected: focused }}
            onPress={() => route && navigateToTab(route.key)} style={styles.item}>
            <Icon color={tint} size={23} strokeWidth={focused ? 2.4 : 2} />
            <AppText size={11} weight={focused ? 'semibold' : 'medium'} color={tint} style={{ marginTop: 4 }}>{t(label)}</AppText>
          </Touchable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', backgroundColor: '#0B0B0D', borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 8 },
  item: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', minHeight: 52 },
  fab: {
    width: 58, height: 58, borderRadius: 29, marginTop: -26, backgroundColor: '#1A1A1F', borderWidth: 2,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.6, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 10,
  },
});
