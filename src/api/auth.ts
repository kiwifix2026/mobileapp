import { apiFetch } from './client';
import type { SendOtpResponse, VerifyCustomerOtpResponse, VerifyTradieLoginOtpResponse } from './types';

// Job-poster (customer) auth — POST /auth/otp/send + /verify. Backend
// figures out new-vs-returning itself (see AuthService.sendOtp), no
// separate signup call needed.
export function sendCustomerOtp(email: string) {
  return apiFetch<SendOtpResponse>('/auth/otp/send', { method: 'POST', body: { email } });
}

export function verifyCustomerOtp(email: string, code: string) {
  return apiFetch<VerifyCustomerOtpResponse>('/auth/otp/verify', { method: 'POST', body: { email, code } });
}

// Tradie sign-in — POST /auth/tradie-login-otp/*. Only works for a tradie
// who already completed onboarding on the web app; the backend returns a
// 401 ("No tradie account found for this email") otherwise. Full tradie
// onboarding (business details, licences, service areas — the multi-step
// wizard on the web app) isn't part of this first mobile pass — see
// README for that scoping note.
export function sendTradieLoginOtp(email: string) {
  return apiFetch<SendOtpResponse>('/auth/tradie-login-otp/send', { method: 'POST', body: { email } });
}

export function verifyTradieLoginOtp(email: string, code: string) {
  return apiFetch<VerifyTradieLoginOtpResponse>('/auth/tradie-login-otp/verify', {
    method: 'POST',
    body: { email, code },
  });
}

// Tradie sign-UP — POST /auth/tradie-otp/*. Formality-only email-ownership
// check used before a brand new tradie's first POST /tradies (see
// TradiesController.upsert's comment: it trusts this step happened, no
// server-side token linking the two calls). Returns { verified: true } only
// — no accessToken here, that only comes back once upsert() actually
// creates the tradie record.
export function sendTradieSignupOtp(email: string) {
  return apiFetch<SendOtpResponse>('/auth/tradie-otp/send', { method: 'POST', body: { email } });
}

export function verifyTradieSignupOtp(email: string, code: string) {
  return apiFetch<{ verified: boolean }>('/auth/tradie-otp/verify', { method: 'POST', body: { email, code } });
}
