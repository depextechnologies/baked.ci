import { Redirect, Tabs } from 'expo-router';
import React from 'react';

import { TabBar } from '@/components/TabBar';
import { useApp } from '@/state/AppContext';
import { colors } from '@/theme';

export default function TabsLayout() {
  const { onboardingDone } = useApp();
  if (!onboardingDone) return <Redirect href="/onboarding" />;
  return (
    <Tabs
      tabBar={(props: any) => <TabBar {...props} />}
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: colors.bg } } as any}
    >
      <Tabs.Screen name="index" />
      <Tabs.Screen name="explore" />
      <Tabs.Screen name="switcher" />
      <Tabs.Screen name="activity" />
      <Tabs.Screen name="profile" />
    </Tabs>
  );
}
