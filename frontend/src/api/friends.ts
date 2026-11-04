import { API_URL } from '../config';
import { AuthError } from './games';
import type { ProfileStats, StatsRange } from './profile';

export interface FriendUser {
  id: number;
  username: string;
  avatarEmoji: string | null;
  avatarColor: string | null;
  avatarImage: string | null;
}

export type Presence = 'offline' | 'online' | 'playing';
export type Relation = 'none' | 'friends' | 'outgoing' | 'incoming' | 'self';

export interface FriendLists {
  friends: (FriendUser & { presence: Presence })[];
  incoming: FriendUser[];
  outgoing: FriendUser[];
}

export interface PublicProfile extends FriendUser {
  bio: string | null;
  bannerImage: string | null;
  createdAt: string;
  presence: Presence;
}

export interface HeadToHead {
  games: number;
  myWins: number;
  theirWins: number;
}

async function request<T>(token: string, path: string, method = 'GET', body?: unknown): Promise<T> {
  const res = await fetch(`${API_URL}/friends${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) throw new AuthError('Kirjautuminen on vanhentunut, kirjaudu uudelleen');
  if (!res.ok) throw new Error(data.error || 'Jokin meni pieleen');
  return data;
}

export function getFriends(token: string) {
  return request<FriendLists>(token, '');
}

export function lookupFriendCode(token: string, code: string) {
  return request<{ user: FriendUser; relation: Relation }>(token, `/lookup/${encodeURIComponent(code)}`);
}

export function sendFriendRequest(token: string, code: string) {
  return request<{ relation: Relation }>(token, '/requests', 'POST', { code });
}

export function acceptFriendRequest(token: string, userId: number) {
  return request<{ ok: true }>(token, `/requests/${userId}/accept`, 'POST');
}

// Hylkää pyynnön, peruu oman pyynnön tai poistaa kaverin
export function removeFriend(token: string, userId: number) {
  return request<{ ok: true }>(token, `/${userId}`, 'DELETE');
}

export function getFriendProfile(token: string, userId: number, range: StatsRange) {
  return request<{ profile: PublicProfile; stats: ProfileStats; headToHead: HeadToHead }>(token, `/${userId}/profile?range=${range}`);
}

export function inviteFriend(token: string, userId: number, roomCode: string) {
  return request<{ ok: true; throttled?: boolean }>(token, `/${userId}/invite`, 'POST', { roomCode });
}

// Kaverikoodi näytetään muodossa K7M-4QX
export function formatFriendCode(code: string) {
  return `${code.slice(0, 3)}-${code.slice(3)}`;
}
