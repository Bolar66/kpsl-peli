import { API_URL } from '../config';
import { AuthError } from './games';
import type { QuizLevel } from '../constants/flags';

export interface FlagRecord {
  userId: number;
  username: string;
  avatarEmoji: string | null;
  avatarColor: string | null;
  avatarImage: string | null;
  best: number;
  isMe: boolean;
}

export async function getFlagRecords(token: string, level: QuizLevel, count: number): Promise<FlagRecord[]> {
  const res = await fetch(`${API_URL}/flags/records?level=${level}&count=${count}`, { headers: { Authorization: `Bearer ${token}` } });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 || res.status === 403) throw new AuthError('Kirjautuminen on vanhentunut, kirjaudu uudelleen');
  if (!res.ok) throw new Error(data.error || 'Ennätyksiä ei voitu hakea');
  return data.records;
}
