import React from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';

import { MainHome } from '@/components/home/MainHome';
import { ModuleHome } from '@/components/module/ModuleHome';
import { isActiveModule } from '@/lib/modules';
import { useApp } from '@/state/AppContext';
import { colors } from '@/theme';

// Context-aware Home: BAKĒD Main Home, or the homepage of the module the customer is in.
export default function HomeTab() {
  const { activeContext } = useApp();
  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      {activeContext !== 'baked' && isActiveModule(activeContext) ? <ModuleHome key={activeContext} code={activeContext} /> : <MainHome />}
    </SafeAreaView>
  );
}
