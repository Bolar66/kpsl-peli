import type { Namespace } from 'socket.io';

// Sovelluksen laajuinen yhteys (/presence-nimiavaruus): kuka on paikalla, ja reaaliaikaiset
// ilmoitukset (pelikutsut, kaveripyynnöt). Pelihuoneiden yhteys on erillinen, joten tämä ei
// vaikuta pelin kulkuun.
let presence: Namespace | null = null;
const socketCounts = new Map<number, number>();
interface RoomResolvers {
  // Pelin nimi ja huoneen osoite kutsuja varten
  name: string;
  path: (roomCode: string) => string;
  inGame: (userId: number) => boolean;
  isInRoom: (userId: number, roomCode: string) => boolean;
}
const resolvers: RoomResolvers[] = [];

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

// Pelihuoneiden tila on kunkin pelin omassa moduulissa; ne kertovat tänne, kuka pelaa ja kuka on missäkin huoneessa
export function addRoomResolvers(game: RoomResolvers) {
  resolvers.push(game);
}

export function getPresence(userId: number): 'offline' | 'online' | 'playing' {
  if (resolvers.some(r => r.inGame(userId))) return 'playing';
  return socketCounts.has(userId) ? 'online' : 'offline';
}

// Peli, jonka huoneessa käyttäjä on (kutsu vie kaverin samaan huoneeseen)
export function findRoomGame(userId: number, roomCode: string): { name: string; path: string } | null {
  const game = resolvers.find(r => r.isInRoom(userId, roomCode));
  return game ? { name: game.name, path: game.path(roomCode) } : null;
}

export function isOnline(userId: number) {
  return socketCounts.has(userId);
}

export function emitToUser(userId: number, event: string, data: unknown) {
  presence?.to(`user:${userId}`).emit(event, data);
}
