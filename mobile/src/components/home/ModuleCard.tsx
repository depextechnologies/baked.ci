import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { ArrowRight } from 'lucide-react-native';
import React from 'react';
import { StyleSheet, View } from 'react-native';

import { useModuleNav } from '@/hooks/useModuleNav';
import { MODULES, type ModuleCode } from '@/lib/modules';
import { notify } from '@/lib/notify';
import { useApp } from '@/state/AppContext';
import { colors, hexA, radius } from '@/theme';
import { BrandName } from '../BrandName';
import { AppText } from '../ui/AppText';
import { Touchable } from '../ui/Button';

export function ModuleCard({ code }: { code: ModuleCode }) {
  const { t } = useApp();
  const { openModule } = useModuleNav();
  const m = MODULES[code];
  const active = m.status === 'active';

  const onPress = () => {
    if (openModule(code)) return;
    notify(t('mod.coming_soon_msg', { name: `${m.label}bakēd` }), `${m.label}bakēd`);
  };

  return (
    <Touchable testID={`module-card-${code}`} onPress={onPress} style={[styles.card, { borderColor: hexA(m.color, 0.45) }]}>
      <LinearGradient colors={[hexA(m.color, 0.2), hexA(m.color, 0.04), '#000000']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      <Image source={m.image} style={styles.img} contentFit="contain" contentPosition="right bottom" />
      <View style={styles.text}>
        <BrandName code={code} size={22} />
        <AppText size={12} color="#E4E4E7" numberOfLines={3} style={{ marginTop: 6, maxWidth: '78%' }}>{t(`mod.${code}.desc` as any)}</AppText>
      </View>
      <View style={styles.footer}>
        <View style={[styles.arrow, { borderColor: m.color }]}><ArrowRight color={m.color} size={18} /></View>
        {!active ? (
          <View style={styles.soon} testID={`module-card-soon-${code}`}>
            <AppText weight="bold" size={10} color={colors.text} style={{ letterSpacing: 1 }}>{t('common.soon').toUpperCase()}</AppText>
          </View>
        ) : null}
      </View>
    </Touchable>
  );
}

const styles = StyleSheet.create({
  card: { width: '48.5%', height: 196, borderRadius: radius.lg, borderWidth: 1, overflow: 'hidden', padding: 14, justifyContent: 'space-between', backgroundColor: '#050505' },
  img: { position: 'absolute', right: -6, bottom: 4, width: '74%', height: '62%' },
  text: { zIndex: 1 },
  footer: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  arrow: { width: 38, height: 38, borderRadius: 19, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.35)' },
  soon: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill, backgroundColor: 'rgba(0,0,0,0.6)', borderWidth: 1, borderColor: colors.border },
});
