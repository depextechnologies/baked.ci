import {
  Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold, Inter_800ExtraBold, useFonts,
} from '@expo-google-fonts/inter';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import React, { useMemo } from 'react';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { SplashOverlay } from '@/components/SplashOverlay';
import { AppProvider, useApp } from '@/state/AppContext';
import { SessionProvider, useSession } from '@/state/SessionContext';
import { CartProvider } from '@/state/CartContext';
import { SendDraftProvider } from '@/state/SendDraftContext';
import { SwitcherProvider } from '@/state/SwitcherContext';
import { ThemeModeProvider, useThemeMode } from '@/state/ThemeContext';
import { colors } from '@/theme';

SplashScreen.preventAutoHideAsync().catch(() => {});

function Root({ fontsLoaded }: { fontsLoaded: boolean }) {
  const { hydrated, t } = useApp();
  const { ready } = useSession();
  const { scheme, loaded } = useThemeMode();
  const appReady = fontsLoaded && hydrated && ready && loaded;
  const navTheme = useMemo(() => {
    const base = scheme === 'dark' ? DarkTheme : DefaultTheme;
    return { ...base, colors: { ...base.colors, background: colors.bg, card: colors.bg, text: colors.text, border: colors.border } };
  }, [scheme]);
  return (
    <ThemeProvider value={navTheme}>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <View style={{ flex: 1, backgroundColor: colors.bg }} testID={`app-root-${scheme}`}>
        {appReady ? (
          <Stack key={scheme} screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg }, animation: 'fade_from_bottom' }}>
            <Stack.Screen name="(tabs)" options={{ animation: 'fade' }} />
            <Stack.Screen name="onboarding" options={{ animation: 'fade' }} />
            <Stack.Screen name="address" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
          </Stack>
        ) : null}
        {fontsLoaded ? <SplashOverlay ready={appReady} tagline={t('brand.tagline')} /> : null}
      </View>
    </ThemeProvider>
  );
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({ Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold, Inter_800ExtraBold });
  return (
    <SafeAreaProvider>
      <AppProvider>
        <SessionProvider>
          <ThemeModeProvider>
            <CartProvider>
              <SendDraftProvider>
                <SwitcherProvider>
                  <Root fontsLoaded={fontsLoaded} />
                </SwitcherProvider>
              </SendDraftProvider>
            </CartProvider>
          </ThemeModeProvider>
        </SessionProvider>
      </AppProvider>
    </SafeAreaProvider>
  );
}
