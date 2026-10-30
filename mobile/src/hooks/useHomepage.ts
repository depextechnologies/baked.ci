import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { api } from '@/lib/api';
import type { CmsHomepage } from '@/lib/cms';
import { prefs } from '@/lib/storage';

// Published homepage with cache-first paint, version check on foreground, pull-to-refresh and offline fallback.
export function useHomepage(module: string | null, country: string) {
  const key = `hp_${module}_${country}`;
  const [data, setData] = useState<CmsHomepage | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [offline, setOffline] = useState(false);
  const verRef = useRef<string | null>(null);
  const q = `country=${country}&module=${module}`;

  const load = useCallback(async () => {
    if (!module) return;
    try {
      const hp = await api<CmsHomepage>(`/homepage?${q}`, { auth: false });
      verRef.current = hp.version; setData(hp); setOffline(false); prefs.set(key, hp);
    } catch {
      setOffline(true);
    }
  }, [q, key, module]);

  useEffect(() => {
    let alive = true;
    setLoading(true); setData(null); verRef.current = null;
    prefs.get<CmsHomepage | null>(key, null).then((c) => { if (alive && c && !verRef.current) setData(c); });
    load().finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [key, load]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', async (s) => {
      if (s !== 'active' || !module) return;
      try {
        const { version } = await api<{ version: string }>(`/homepage/version?${q}`, { auth: false });
        if (version !== verRef.current) await load();
      } catch { /* keep current content; next foreground or pull-to-refresh retries */ }
    });
    return () => sub.remove();
  }, [q, load, module]);

  const refresh = useCallback(async () => { setRefreshing(true); await load(); setRefreshing(false); }, [load]);
  return { data, loading: loading && !data, refreshing, offline, refresh };
}
