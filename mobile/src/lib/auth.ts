import { api } from './api';

export type OtpRequest = { challenge_id: string; masked_phone: string; dev_code?: string };

export const requestOtp = (country_code: string, phone: string) =>
  api<OtpRequest>('/auth/otp/request', { method: 'POST', body: { country_code, phone }, auth: false });

// Same list as the website PhoneLoginDialog.
export const PHONE_CODES = [['CI', '+225'], ['GB', '+44'], ['IN', '+91'], ['SN', '+221'], ['GH', '+233'], ['NG', '+234'], ['KE', '+254']];
