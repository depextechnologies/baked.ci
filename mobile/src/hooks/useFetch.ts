import { useCallback, useEffect, useState } from 'react';

import { api } from '@/lib/api';

// Small data hook: loading / error / retry for read-only screens.
export function useFetch<T>(path: string | null, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(!!path);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!path) { setLoading(false); return; }
    setLoading(true); setError(null);
    try { setData(await api<T>(path)); } catch (e: any) { setError(e?.message || 'error'); } finally { setLoading(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, ...deps]);

  useEffect(() => { load(); }, [load]);
  return { data, loading, error, reload: load };
}
