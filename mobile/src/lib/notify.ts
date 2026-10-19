import { Alert, Platform } from 'react-native';

export const notify = (message: string, title = 'BAKĒD') => {
  if (Platform.OS === 'web') globalThis.alert?.(message);
  else Alert.alert(title, message);
};

export const confirmAsk = (message: string, ok: string, cancel: string): Promise<boolean> => {
  if (Platform.OS === 'web') return Promise.resolve(!!globalThis.confirm?.(message));
  return new Promise((resolve) => Alert.alert('BAKĒD', message, [
    { text: cancel, style: 'cancel', onPress: () => resolve(false) },
    { text: ok, style: 'destructive', onPress: () => resolve(true) },
  ]));
};
