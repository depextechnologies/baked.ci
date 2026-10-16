import { router } from 'expo-router';
import { ChevronDown, MapPin, ScanLine, Search } from 'lucide-react-native';
import React from 'react';
import { StyleSheet, View } from 'react-native';

import { useApp } from '@/state/AppContext';
import { colors, radius } from '@/theme';
import { AppText } from '../ui/AppText';
import { Touchable } from '../ui/Button';

export function AddressBar({ accent = colors.accent }: { accent?: string }) {
  const { t, address, country } = useApp();
  const title = address ? [address.line1, address.city].filter(Boolean).join(', ') : t('addr.choose');
  return (
    <Touchable testID="address-bar" onPress={() => router.push('/address')} style={styles.card} scale={0.99}>
      <MapPin color={colors.text} size={24} />
      <View style={{ flex: 1 }}>
        <AppText weight="semibold" size={16} numberOfLines={1} testID="address-bar-title">{title}</AppText>
        <View style={styles.sub}>
          <AppText size={13} color={colors.textMuted}>{address ? t('addr.delivering_to') : t('addr.tap_to_set')}</AppText>
          {address && country?.delivery_eta_min ? (
            <View style={[styles.eta, { backgroundColor: `${accent}26` }]}>
              <AppText weight="semibold" size={12} color={accent}>{country.delivery_eta_min}</AppText>
            </View>
          ) : null}
        </View>
      </View>
      <ChevronDown color={colors.textMuted} size={22} />
    </Touchable>
  );
}

export function SearchBar({ placeholder }: { placeholder: string }) {
  return (
    <Touchable testID="home-search" onPress={() => router.navigate('/explore?focus=1')} style={[styles.card, { paddingVertical: 15 }]} scale={0.99}>
      <Search color={colors.textMuted} size={22} />
      <AppText size={15} color="#C9B99A" style={{ flex: 1 }}>{placeholder}</AppText>
      <ScanLine color={colors.textMuted} size={20} />
    </Touchable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row', alignItems: 'center', gap: 14, marginHorizontal: 18, marginBottom: 14,
    paddingHorizontal: 18, paddingVertical: 12, borderRadius: radius.md,
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
  },
  sub: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 },
  eta: { paddingHorizontal: 8, paddingVertical: 1, borderRadius: radius.pill },
});
