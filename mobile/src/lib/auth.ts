import { api } from './api';

export type OtpRequest = { challenge_id: string; masked_phone: string; dev_code?: string };

export const requestOtp = (country_code: string, phone: string) =>
  api<OtpRequest>('/auth/otp/request', { method: 'POST', body: { country_code, phone }, auth: false });
