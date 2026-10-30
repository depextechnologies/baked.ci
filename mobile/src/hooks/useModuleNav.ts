import { router } from 'expo-router';
import { useCallback } from 'react';

import { isActiveModule, type ModuleCode } from '@/lib/modules';
import { useApp } from '@/state/AppContext';

// Context switching keeps session, address and cart untouched — only the active module changes.
export function useModuleNav() {
  const { setActiveContext } = useApp();

  const goMainHome = useCallback(() => {
    setActiveContext('baked');
    router.navigate('/');
  }, [setActiveContext]);

  const openModule = useCallback((code: ModuleCode) => {
    if (!isActiveModule(code)) return false;
    setActiveContext(code);
    router.navigate('/');
    return true;
  }, [setActiveContext]);

  return { goMainHome, openModule };
}
