import type { Namespace } from 'socket.io';

// Sovelluksen laajuinen yhteys (/presence-nimiavaruus): kuka on paikalla, ja reaaliaikaiset
// ilmoitukset (pelikutsut, kaveripyynnöt). Pelihuoneiden yhteys on erillinen, joten tämä ei
// vaikuta pelin kulkuun.
let presence: Namespace | null = null;
const socketCounts = new Map<number, number>();
let inGameResolver: (userId: number) => boolean = () => false;
let roomMemberResolver: (userId: number, roomCode: string) => boolean = () => false;

export function attachPresence(ns: Namespace) {
  presence = ns;
}

export function userConnected(userId: number) {
  socketCounts.set(userId, (socketCounts.get(userId) ?? 0) + 1);
}

export function userDisconnected(userId: number) {
  const left = (socketCounts.get(userId) ?? 1) - 1;
  if (left <= 0) socketCounts.delete(userId);
  else socketCounts.set(userId, left);
}

// Pelihuoneiden tila on index.ts:ssä; se kertoo tänne, kuka pelaa ja kuka on missäkin huoneessa
export function setRoomResolvers(resolvers: {
  inGame: (userId: number) => boolean;
  isInRoom: (userId: number, roomCode: string) => boolean;
}) {
  inGameResolver = resolvers.inGame;
  roomMemberResolver = resolvers.isInRoom;
}

export function getPresence(userId: number): 'offline' | 'online' | 'playing' {
  if (inGameResolver(userId)) return 'playing';
  return socketCounts.has(userId) ? 'online' : 'offline';
}

export function isInRoom(userId: number, roomCode: string) {
  return roomMemberResolver(userId, roomCode);
}

export function isOnline(userId: number) {
  return socketCounts.has(userId);
}

export function emitToUser(userId: number, event: string, data: unknown) {
  presence?.to(`user:${userId}`).emit(event, data);
}
