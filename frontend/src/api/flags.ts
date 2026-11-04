import { io } from 'socket.io-client';
import { API_URL, SERVER_URL } from '../config';
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

// Luo lippuvisahuoneen palvelimella ja palauttaa sen koodin. practice = harjoitus annetuista lipuista.
export function createFlagRoom(token: string, options: { solo: boolean; practice?: string[] }): Promise<string> {
  return new Promise((resolve, reject) => {
    const socket = io(`${SERVER_URL}/flags`, { auth: { token } });
    const fail = (err: Error) => { socket.disconnect(); reject(err); };
    socket.on('connect_error', fail);
    socket.on('connect', () => {
      socket.timeout(8000).emit('fq:create', options, (err: Error | null, res: { roomCode: string }) => {
        socket.disconnect();
        if (err || !res?.roomCode) reject(new Error('Huoneen luonti epäonnistui'));
        else resolve(res.roomCode);
      });
    });
  });
}
