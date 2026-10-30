import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const TOKEN_KEY = 'baked_access_token';

// Tokens live in the OS keychain/keystore on device; web preview falls back to localStorage.
export const secureToken = {
  async get(): Promise<string | null> {
    if (Platform.OS === 'web') return globalThis.localStorage?.getItem(TOKEN_KEY) ?? null;
    return SecureStore.getItemAsync(TOKEN_KEY);
  },
  async set(value: string) {
    if (Platform.OS === 'web') return globalThis.localStorage?.setItem(TOKEN_KEY, value);
    return SecureStore.setItemAsync(TOKEN_KEY, value);
  },
  async clear() {
    if (Platform.OS === 'web') return globalThis.localStorage?.removeItem(TOKEN_KEY);
    return SecureStore.deleteItemAsync(TOKEN_KEY);
  },
};

export const prefs = {
  async get<T>(key: string, fallback: T): Promise<T> {
    const raw = await AsyncStorage.getItem(`baked_${key}`);
    if (raw == null) return fallback;
    try { return JSON.parse(raw) as T; } catch { return fallback; }
  },
  set(key: string, value: unknown) {
    return AsyncStorage.setItem(`baked_${key}`, JSON.stringify(value));
  },
  remove(key: string) {
    return AsyncStorage.removeItem(`baked_${key}`);
  },
};
