import { User } from 'lucide-react-native';
import React from 'react';
import { StyleSheet, View } from 'react-native';

import { absUrl } from '@/lib/cms';
import { colors, themed } from '@/theme';
import { AppText } from '../ui/AppText';
import { SafeImage } from '../ui/SafeImage';

// Round profile picture; initials or a person icon when there is no photo (or it fails to load).
export function Avatar({ uri, name, size = 56, testID }: { uri?: string | null; name?: string | null; size?: number; testID?: string }) {
  const initial = (name || '').trim()[0]?.toUpperCase();
  const fallback = initial
    ? <AppText weight="bold" size={size * 0.4} testID={testID ? `${testID}-initial` : undefined}>{initial}</AppText>
    : <User color={colors.text} size={size * 0.46} />;
  return (
    <View style={[styles.box, { width: size, height: size, borderRadius: size / 2 }]} testID={testID}>
      <SafeImage source={absUrl(uri)} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} fallback={fallback} testID={testID ? `${testID}-img` : undefined} />
    </View>
  );
}

const styles = themed(() => StyleSheet.create({
  box: { backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
}));
