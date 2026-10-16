import { Alert, Platform } from 'react-native';

export const notify = (message: string, title = 'BAKĒD') => {
  if (Platform.OS === 'web') globalThis.alert?.(message);
  else Alert.alert(title, message);
};
