import { API_URL } from '../config';
import type { User } from '../context/AuthContext';

export interface AuthResponse {
  token: string;
  user: User;
}

export async function register(username: string, password: string, email?: string): Promise<AuthResponse> {
  const res = await fetch(`${API_URL}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password, email: email || undefined }),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Rekisteröinti epäonnistui');
  }
  return data;
}

export async function login(username: string, password: string): Promise<AuthResponse> {
  const res = await fetch(`${API_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Kirjautuminen epäonnistui');
  }
  return data;
}
export async function playAsGuest(username: string): Promise<AuthResponse> {
  const res = await fetch(`${API_URL}/auth/guest`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username }),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Vieraana pelaaminen epäonnistui');
  }
  return data;
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Jokin meni pieleen');
  return data;
}

// Palautuslinkin pyyntö nimimerkillä tai sähköpostilla
export function requestPasswordReset(identifier: string) {
  return postJson<{ ok: true; message: string }>('/auth/forgot', { identifier });
}

// Uuden salasanan asetus palautuslinkin tunnisteella
export function resetPassword(token: string, password: string) {
  return postJson<{ ok: true }>('/auth/reset', { token, password });
}
