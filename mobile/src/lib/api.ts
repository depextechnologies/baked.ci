import { API_URL } from './config';

let authToken: string | null = null;
let language = 'fr';
let onUnauthorized: (() => void) | null = null;

export const apiSession = {
  setToken: (t: string | null) => { authToken = t; },
  setLanguage: (l: string) => { language = l; },
  onUnauthorized: (cb: () => void) => { onUnauthorized = cb; },
};

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const detailToMessage = (detail: unknown): string => {
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) return detail.map((d: any) => d?.msg).filter(Boolean).join(' · ');
  return '';
};

type Opts = { method?: string; body?: unknown; auth?: boolean; timeoutMs?: number; retries?: number };

export async function api<T = any>(path: string, opts: Opts = {}): Promise<T> {
  const { method = 'GET', body, auth = true, timeoutMs = 15000, retries = method === 'GET' ? 1 : 0 } = opts;
  const headers: Record<string, string> = { Accept: 'application/json', 'X-BAKED-Language': language };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (auth && authToken) headers.Authorization = `Bearer ${authToken}`;

  for (let attempt = 0; ; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(`${API_URL}${path}`, {
        method, headers, body: body !== undefined ? JSON.stringify(body) : undefined, signal: ctrl.signal,
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        if (res.status === 401 && auth && authToken) onUnauthorized?.();
        throw new ApiError(res.status, detailToMessage(data?.detail) || `HTTP ${res.status}`);
      }
      return data as T;
    } catch (e) {
      const retryable = !(e instanceof ApiError) || e.status >= 500;
      if (attempt < retries && retryable) continue;
      if (e instanceof ApiError) throw e;
      throw new ApiError(0, 'network');
    } finally {
      clearTimeout(timer);
    }
  }
}
