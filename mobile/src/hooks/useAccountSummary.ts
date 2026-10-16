import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import { api } from '@/lib/api';
import { useSession } from '@/state/SessionContext';

export type WalletInfo = { balance: number; currency: string; currency_symbol: string; transactions: any[]; note?: string };

// Live account widgets for the header + quick strip; refreshes whenever the screen regains focus.
export function useAccountSummary() {
  const { isAuthed } = useSession();
  const [wallet, setWallet] = useState<WalletInfo | null>(null);
  const [unread, setUnread] = useState(0);
  const [points, setPoints] = useState<number | null>(null);

  useFocusEffect(useCallback(() => {
    if (!isAuthed) { setWallet(null); setUnread(0); setPoints(null); return; }
    api<WalletInfo>('/customers/me/wallet').then(setWallet).catch(() => setWallet(null));
    api<{ unread_count: number }>('/customers/me/notifications?limit=1').then((r) => setUnread(r.unread_count)).catch(() => setUnread(0));
    api<{ points: number }>('/customers/me/rewards').then((r) => setPoints(r.points)).catch(() => setPoints(null));
  }, [isAuthed]));

  return { wallet, unread, points };
}
