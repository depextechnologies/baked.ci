import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import React, { useRef, useState } from 'react';
import { FlatList, StyleSheet, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { LangToggle } from '@/components/LangToggle';
import { AppText } from '@/components/ui/AppText';
import { Button, Touchable } from '@/components/ui/Button';
import type { TKey } from '@/lib/i18n';
import { useApp } from '@/state/AppContext';
import { colors } from '@/theme';

const SLIDES = [
  { id: '1', image: require('../../assets/images/onboarding/onb1.jpg'), accent: '#77BC1F' },
  { id: '2', image: require('../../assets/images/onboarding/onb2.jpg'), accent: '#FCC44C' },
  { id: '3', image: require('../../assets/images/onboarding/onb3.jpg'), accent: '#F5A524' },
];

export default function Onboarding() {
  const { t } = useApp();
  const { width, height } = useWindowDimensions();
  const [index, setIndex] = useState(0);
  const list = useRef<FlatList>(null);
  const last = index === SLIDES.length - 1;

  const onViewable = useRef(({ viewableItems }: { viewableItems: { index?: number | null }[] }) => {
    if (viewableItems[0]?.index != null) setIndex(viewableItems[0].index);
  }).current;

  const finish = () => router.replace('/location-permission');
  const next = () => (last ? finish() : list.current?.scrollToIndex({ index: index + 1, animated: true }));

  return (
    <View style={styles.root} testID="onboarding-screen">
      <FlatList
        ref={list}
        data={SLIDES}
        keyExtractor={(s) => s.id}
        horizontal pagingEnabled showsHorizontalScrollIndicator={false} bounces={false}
        onViewableItemsChanged={onViewable}
        viewabilityConfig={{ itemVisiblePercentThreshold: 60 }}
        getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
        renderItem={({ item }) => (
          <View style={{ width, height }} testID={`onboarding-slide-${item.id}`}>
            <Image source={item.image} style={StyleSheet.absoluteFill} contentFit="cover" />
            <LinearGradient colors={['rgba(0,0,0,0.1)', 'rgba(0,0,0,0.2)', '#000']} locations={[0, 0.45, 0.78]} style={StyleSheet.absoluteFill} />
          </View>
        )}
      />
      <SafeAreaView style={styles.overlay} pointerEvents="box-none">
        <View style={styles.top}>
          <LangToggle />
          {!last ? (
            <Touchable testID="onboarding-skip" onPress={finish} hitSlop={10}>
              <AppText weight="semibold" size={15} color={colors.textMuted}>{t('common.skip')}</AppText>
            </Touchable>
          ) : null}
        </View>
        <View style={styles.bottom}>
          <AppText weight="black" size={32} style={{ letterSpacing: -0.8, lineHeight: 38 }} testID="onboarding-title">
            {t(`onb.${SLIDES[index].id}.title` as TKey)}
          </AppText>
          <AppText size={16} color={colors.textMuted} style={{ marginTop: 10, marginBottom: 26 }}>
            {t(`onb.${SLIDES[index].id}.body` as TKey)}
          </AppText>
          <View style={styles.dots} testID="onboarding-progress">
            {SLIDES.map((s, i) => (
              <View key={s.id} style={[styles.dot, i === index && { width: 26, backgroundColor: SLIDES[index].accent }]} />
            ))}
          </View>
          <Button testID="onboarding-next" label={last ? t('common.get_started') : t('common.next')} onPress={next} />
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'space-between' },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 8 },
  bottom: { paddingHorizontal: 24, paddingBottom: 18 },
  dots: { flexDirection: 'row', gap: 6, marginBottom: 22 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#3A3A40' },
});
