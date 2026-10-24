import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';

import { api } from './api';
import type { Customer } from '@/state/SessionContext';

const AUTH_URL = 'https://auth.emergentagent.com/?redirect=';
const KEY = 'baked_google_redirect';
type AuthOut = { access_token: string; customer: Customer };

// REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
// Web: return to the current login page (origin + path); native: deep link back into the app.
export async function startGoogle(redirect: string): Promise<AuthOut | null> {
  if (Platform.OS === 'web') {
    window.sessionStorage.setItem(KEY, redirect);
    const back = window.location.origin + window.location.pathname;
    window.location.href = AUTH_URL + encodeURIComponent(back);
    return null;
  }
  const back = Linking.createURL('login');
  const res = await WebBrowser.openAuthSessionAsync(AUTH_URL + encodeURIComponent(back), back);
  if (res.type !== 'success') return null;
  const sid = res.url.match(/session_id=([^&]+)/)?.[1];
  return sid ? exchange(sid) : null;
}

const exchange = (session_id: string) => api<AuthOut>('/auth/emergent/session', { method: 'POST', body: { session_id }, auth: false });

// Web callback: `#session_id=` lands on /login; consume it once and clear the fragment.
export async function consumeWebCallback(): Promise<{ out: AuthOut; redirect: string } | null> {
  if (Platform.OS !== 'web') return null;
  const sid = window.location.hash.match(/session_id=([^&]+)/)?.[1];
  if (!sid) return null;
  window.history.replaceState(null, '', window.location.pathname + window.location.search);
  const redirect = window.sessionStorage.getItem(KEY) || '/';
  window.sessionStorage.removeItem(KEY);
  return { out: await exchange(sid), redirect };
}
