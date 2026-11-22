// Map backend auth errors (status + English message) to localized, non-enumerating copy.
export function authError(e: any, tr: (k: any) => string): string {
  const t = tr as (k: string) => string;
  const m = String(e?.message || '');
  if (e?.status === 0) return t('common.network_error');
  if (e?.status === 401) return t('auth.bad_creds');
  if (e?.status === 429) return t('auth.too_many');
  if (e?.status === 409) return /email/i.test(m) ? t('auth.email_taken') : t('auth.account_exists');
  if (e?.status === 422 && /guess/i.test(m)) return t('auth.pw_common');
  if (e?.status === 422 && /phone/i.test(m)) return t('login.invalid_phone');
  if (e?.status === 400 && /code|expired/i.test(m)) return t('auth.code_bad');
  return m || t('common.network_error');
}
