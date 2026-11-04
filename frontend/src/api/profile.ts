import { API_URL } from '../config';
import { AuthError } from './games';

export interface Profile {
  id: number;
  username: string;
  isGuest: boolean;
  avatarEmoji: string | null;
  avatarColor: string | null;
  avatarImage: string | null;
  email: string | null;
  friendCode: string | null;
  bio: string | null;
  bannerImage: string | null;
  createdAt: string;
}

export type StatsRange = 'all' | 'last5' | 'last20' | '30d';

export interface FlagStatRow {
  level: 'tourist' | 'backpacker' | 'globetrotter' | 'lottery';
  games: number;
  multiGames: number;
  wins: number;
  correct: number;
  half: number;
  questions: number;
  avgAnswerMs: number | null;
  bestSolo: number | null;
}

export interface SymbolStat {
  symbol: string;
  count: number;
  wins: number;
  losses: number;
  draws: number;
  decided: number;
}

export interface RecentGame {
  id: number;
  vsBots: boolean;
  playedAt: string;
  mode: 'classic' | 'extended';
  winsRequired: number;
  myWins: number;
  won: boolean;
  winner: string | null;
}

export interface GameStatRow {
  mode: 'classic' | 'extended';
  vsBots: boolean;
  games: number;
  wins: number;
  roundWins: number;
}

export interface OpponentRow {
  mode: 'classic' | 'extended';
  username: string;
  games: number;
  wins: number;
}

// Rivit pelimuodoittain ja vastustajatyypeittäin; profiilisivu suodattaa ja laskee yhteen
export interface ProfileStats {
  range: StatsRange;
  games: GameStatRow[];
  symbols: (SymbolStat & { mode: 'classic' | 'extended'; vsBots: boolean })[];
  recent: RecentGame[];
  opponents: OpponentRow[];
}

async function request<T>(token: string, path: string, method = 'GET', body?: unknown): Promise<T> {
  const res = await fetch(`${API_URL}/profile${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json();
  if (res.status === 401 && path !== '/password') throw new AuthError('Kirjautuminen on vanhentunut, kirjaudu uudelleen');
  if (res.status === 403) throw new AuthError('Kirjautuminen on vanhentunut, kirjaudu uudelleen');
  if (!res.ok) throw new Error(data.error || 'Jokin meni pieleen');
  return data;
}

export function getMyProfile(token: string, range: StatsRange = 'all') {
  return request<{ profile: Profile; stats: ProfileStats; flagStats: FlagStatRow[] }>(token, `/me?range=${range}`);
}

export function regenerateFriendCode(token: string) {
  return request<{ friendCode: string }>(token, '/friend-code', 'POST');
}

export function updateMyProfile(token: string, changes: Partial<Pick<Profile, 'username' | 'avatarEmoji' | 'avatarColor' | 'avatarImage' | 'email' | 'bio' | 'bannerImage'>>) {
  return request<{ profile: Profile; token: string }>(token, '/me', 'PATCH', changes);
}

export function deleteMyAccount(token: string) {
  return request<{ ok: true }>(token, '/me', 'DELETE');
}

export function setPassword(token: string, password: string, currentPassword?: string) {
  return request<{ profile: Profile }>(token, '/password', 'POST', { password, currentPassword });
}
