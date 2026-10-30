import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { Smartphone } from 'lucide-react-native';
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { LangToggle } from '@/components/LangToggle';
import { Logo } from '@/components/Logo';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { useApp } from '@/state/AppContext';
import { colors, themed } from '@/theme';

export default function Welcome() {
  const { t, completeOnboarding } = useApp();
  const guest = () => { completeOnboarding(); router.replace('/'); };

  return (
    <View style={styles.root} testID="welcome-screen">
      <Image source={require('../../assets/images/onboarding/onb2.jpg')} style={styles.hero} contentFit="cover" />
      <LinearGradient colors={['rgba(0,0,0,0.25)', colors.bg]} locations={[0.1, 0.62]} style={StyleSheet.absoluteFill} />
      <SafeAreaView style={styles.content}>
        <View style={styles.top}><Logo height={34} /><LangToggle /></View>
        <View style={{ flex: 1 }} />
        <View style={styles.bottom}>
          <AppText weight="black" size={30} style={{ letterSpacing: -0.6, lineHeight: 36 }}>{t('welcome.title')}</AppText>
          <AppText size={15} color={colors.textMuted} style={{ marginTop: 10, marginBottom: 26 }}>{t('welcome.body')}</AppText>
          <View style={{ gap: 12 }}>
            <Button testID="welcome-phone-login" label={t('welcome.phone')} color={colors.accent}
              icon={<Smartphone color="#000" size={20} />} onPress={() => router.push('/login?redirect=/')} />
            <Button testID="welcome-guest" variant="secondary" label={t('welcome.guest')} onPress={guest} />
          </View>
          <AppText size={11} color={colors.textDim} align="center" style={{ marginTop: 16 }}>{t('welcome.terms')}</AppText>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = themed(() => StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  hero: { position: 'absolute', top: 0, left: 0, right: 0, height: '62%' },
  content: { flex: 1 },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 8 },
  bottom: { paddingHorizontal: 24, paddingBottom: 16 },
}));
