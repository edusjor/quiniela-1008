'use client';

import { apiFetch, setToken } from './api';

type RegisterPayload = {
  email: string;
  username: string;
  fullName: string;
  nationalId: string;
  instagramUsername?: string;
  birthDate: string;
  followsInstagram?: boolean;
  acceptedRules: boolean;
  password: string;
};

export async function register(payload: RegisterPayload) {
  return apiFetch('/auth/register', { method: 'POST', body: JSON.stringify(payload) });
}

export async function login(identifier: string, password: string) {
  const r = await apiFetch<{token:string; user:any}>('/auth/login', { method: 'POST', body: JSON.stringify({ identifier, password }) });
  setToken(r.token);
  return r;
}

type PasswordResetRequestResponse = {
  ok: boolean;
  message: string;
  debug?: {
    userFound?: boolean;
    to?: string;
    resetUrl?: string;
    mailSent?: boolean;
    messageId?: string;
    smtpResponse?: string;
    error?: string;
  };
};

export async function requestPasswordReset(identifier: string) {
  return apiFetch<PasswordResetRequestResponse>('/auth/password/forgot', {
    method: 'POST',
    body: JSON.stringify({ identifier }),
  });
}

export async function resetPassword(token: string, password: string) {
  return apiFetch<{ ok: boolean; message: string }>('/auth/password/reset', {
    method: 'POST',
    body: JSON.stringify({ token, password }),
  });
}

export function logout() {
  setToken(null);
}
