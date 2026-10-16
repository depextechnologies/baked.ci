import { router } from 'expo-router';

// After auth, drop the login screens from history and land on the intended destination.
export function finishAuthFlow(redirect?: string) {
  const target = redirect && redirect.startsWith('/') ? redirect : '/';
  if (router.canDismiss()) router.dismissAll();
  router.replace(target as any);
}
