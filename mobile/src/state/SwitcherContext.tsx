import React, { createContext, useContext, useMemo, useState } from 'react';

import { SwitcherSheet } from '@/components/SwitcherSheet';

const Ctx = createContext<{ open: () => void } | null>(null);

export function SwitcherProvider({ children }: { children: React.ReactNode }) {
  const [visible, setVisible] = useState(false);
  const value = useMemo(() => ({ open: () => setVisible(true) }), []);
  return (
    <Ctx.Provider value={value}>
      {children}
      <SwitcherSheet visible={visible} onClose={() => setVisible(false)} />
    </Ctx.Provider>
  );
}

export const useSwitcher = () => {
  const v = useContext(Ctx);
  if (!v) throw new Error('useSwitcher outside SwitcherProvider');
  return v;
};
