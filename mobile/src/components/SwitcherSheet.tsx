import { LinearGradient } from 'expo-linear-gradient';
import { X } from 'lucide-react-native';
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Dimensions, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useModuleNav } from '@/hooks/useModuleNav';
import { MODULES, SWITCHER_ORDER, type ModuleCode } from '@/lib/modules';
import { useApp } from '@/state/AppContext';
import { colors, hexA, radius } from '@/theme';
import { BrandName } from './BrandName';
import { ModuleIcon } from './ModuleIcon';
import { AppText } from './ui/AppText';
import { Touchable } from './ui/Button';

const H = Dimensions.get('window').height;

export function SwitcherSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const { t } = useApp();
  const [mounted, setMounted] = useState(visible);
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) setMounted(true);
    Animated.timing(anim, { toValue: visible ? 1 : 0, duration: visible ? 280 : 200, useNativeDriver: true })
      .start(() => { if (!visible) setMounted(false); });
  }, [visible, anim]);

  if (!mounted) return null;
  const translateY = anim.interpolate({ inputRange: [0, 1], outputRange: [H * 0.6, 0] });

  return (
    <Modal transparent visible={mounted} onRequestClose={onClose} animationType="none" statusBarTranslucent>
      <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, { opacity: anim }]}>
        <Pressable testID="switcher-backdrop" style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel={t('common.close')} />
      </Animated.View>
      <Animated.View testID="switcher-sheet" style={[styles.sheet, { paddingBottom: insets.bottom + 16, transform: [{ translateY }] }]}>
        <View style={styles.grabber} />
        <View style={styles.head}>
          <View style={{ flex: 1 }}>
            <AppText size={12} color={colors.textMuted} style={{ letterSpacing: 2 }}>{t('switcher.eyebrow')}</AppText>
            <AppText weight="bold" size={24}>{t('switcher.title')}</AppText>
          </View>
          <Touchable testID="switcher-close" onPress={onClose} style={styles.close} hitSlop={8}>
            <X color={colors.text} size={20} />
          </Touchable>
        </View>
        <ScrollView contentContainerStyle={styles.grid} showsVerticalScrollIndicator={false}>
          {SWITCHER_ORDER.map((code) => <SwitcherCard key={code} code={code} onDone={onClose} />)}
        </ScrollView>
        <AppText size={13} color={colors.textMuted} align="center" style={{ marginTop: 8 }}>{t('switcher.footer')}</AppText>
      </Animated.View>
    </Modal>
  );
}

function SwitcherCard({ code, onDone }: { code: ModuleCode; onDone: () => void }) {
  const { t, activeContext } = useApp();
  const { openModule } = useModuleNav();
  const m = MODULES[code];
  const active = m.status === 'active';
  const current = activeContext === code;

  return (
    <Touchable
      testID={`switcher-card-${code}`}
      disabled={!active}
      accessibilityState={{ disabled: !active, selected: current }}
      onPress={() => { onDone(); openModule(code); }}
      style={[styles.card, { borderColor: current ? m.color : active ? hexA(m.color, 0.35) : colors.borderSoft, borderWidth: current ? 2 : 1 }]}
    >
      <LinearGradient
        colors={active ? [hexA(m.color, current ? 0.22 : 0.14), hexA(m.color, 0.02)] : [colors.surface, colors.surface]}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill}
      />
      <View style={[styles.iconBox, { backgroundColor: hexA(m.color, active ? 0.18 : 0.08) }]}>
        <ModuleIcon icon={m.icon} color={active ? m.color : hexA(m.color, 0.5)} />
      </View>
      <BrandName code={code} size={19} dim={!active} />
      <AppText size={12} color={active ? colors.textMuted : colors.textDim} numberOfLines={1}>{t(`mod.${code}.short` as any)}</AppText>
      {current ? (
        <View testID={`switcher-active-${code}`} style={[styles.badge, { backgroundColor: m.color }]}>
          <AppText weight="black" size={10} color="#000" style={{ letterSpacing: 1 }}>{t('common.active').toUpperCase()}</AppText>
        </View>
      ) : !active ? (
        <View style={[styles.badge, { backgroundColor: colors.surface2 }]}>
          <AppText weight="bold" size={10} color={colors.textMuted} style={{ letterSpacing: 1 }}>{t('common.soon').toUpperCase()}</AppText>
        </View>
      ) : null}
    </Touchable>
  );
}

const styles = StyleSheet.create({
  backdrop: { backgroundColor: 'rgba(0,0,0,0.72)' },
  sheet: {
    position: 'absolute', left: 0, right: 0, bottom: 0, maxHeight: H * 0.88,
    backgroundColor: '#111113', borderTopLeftRadius: 28, borderTopRightRadius: 28,
    borderTopWidth: 1, borderColor: colors.border, paddingHorizontal: 18,
  },
  grabber: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: '#3A3A40', marginTop: 10, marginBottom: 14 },
  head: { flexDirection: 'row', alignItems: 'center', marginBottom: 18 },
  close: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 12 },
  card: { width: '48.5%', minHeight: 150, borderRadius: radius.lg, padding: 16, overflow: 'hidden', gap: 4, justifyContent: 'flex-end' },
  iconBox: { width: 52, height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  badge: { position: 'absolute', top: 12, right: 12, paddingHorizontal: 9, paddingVertical: 3, borderRadius: radius.pill },
});
