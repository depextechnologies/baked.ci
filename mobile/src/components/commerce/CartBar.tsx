import { router } from 'expo-router';
import { ShoppingBag } from 'lucide-react-native';
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useApp } from '@/state/AppContext';
import { useCart } from '@/state/CartContext';
import { colors, radius, themed } from '@/theme';
import { AppText } from '../ui/AppText';
import { Touchable } from '../ui/Button';

export function CartButton({ color = colors.text }: { color?: string }) {
  const { count } = useCart();
  return (
    <Touchable testID="header-cart" onPress={() => router.push('/cart')} style={styles.icon} hitSlop={6}>
      <ShoppingBag color={color} size={23} />
      {count > 0 ? (
        <View style={styles.badge} testID="header-cart-count"><AppText weight="bold" size={10} color="#000">{count > 99 ? '99+' : count}</AppText></View>
      ) : null}
    </Touchable>
  );
}

// Floating bar shown on browse screens whenever the shared cart has items.
export function CartBar({ color, inTabs = false }: { color: string; inTabs?: boolean }) {
  const { count } = useCart();
  const { t } = useApp();
  const insets = useSafeAreaInsets();
  if (!count) return null;
  return (
    <View pointerEvents="box-none" style={[styles.barWrap, { bottom: inTabs ? 10 : Math.max(insets.bottom, 12) }]}>
      <Touchable testID={inTabs ? "cart-bar-tabs" : "cart-bar"} onPress={() => router.push('/cart')} style={[styles.bar, { backgroundColor: color }]} scale={0.98}>
        <View style={styles.countPill}><AppText weight="black" size={13} color="#fff">{count}</AppText></View>
        <AppText weight="bold" size={16} color="#000" style={{ flex: 1 }}>{t('cart.view')}</AppText>
        <ShoppingBag color="#000" size={20} />
      </Touchable>
    </View>
  );
}

const styles = themed(() => StyleSheet.create({
  icon: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  badge: { position: 'absolute', top: 3, right: 1, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  barWrap: { position: 'absolute', left: 16, right: 16 },
  bar: { flexDirection: 'row', alignItems: 'center', gap: 12, height: 56, borderRadius: radius.pill, paddingHorizontal: 10, paddingRight: 20, shadowColor: '#000', shadowOpacity: 0.5, shadowRadius: 12, elevation: 8 },
  countPill: { minWidth: 36, height: 36, borderRadius: 18, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
}));
