import { Platform } from 'react-native';

// Booking drafts that must survive the login round-trip (OTP remounts the screen; Google on web reloads the page).
const mem: Record<string, any> = {};
const k = (key: string) => `baked_resume_${key}`;

export function saveResume(key: string, value: any) {
  mem[key] = value;
  if (Platform.OS === 'web') try { window.sessionStorage.setItem(k(key), JSON.stringify(value)); } catch { /* storage full/blocked */ }
}

export function takeResume<T>(key: string): T | null {
  let v = mem[key] ?? null;
  if (!v && Platform.OS === 'web') try { v = JSON.parse(window.sessionStorage.getItem(k(key)) || 'null'); } catch { v = null; }
  return v;
}

export function clearResume(key: string) {
  delete mem[key];
  if (Platform.OS === 'web') try { window.sessionStorage.removeItem(k(key)); } catch { /* noop */ }
}
