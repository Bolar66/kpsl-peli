const API_URL = 'http://localhost:3001/api';

export interface Game {
  id: number;
  room_code: string;
  mode: string;
  wins_required: number;
  status: string;
}

export async function createGame(token: string, mode: string, winsRequired: number): Promise<Game> {
  const res = await fetch(`${API_URL}/games`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ mode, winsRequired }),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Huoneen luonti epäonnistui');
  }
  return data.game;
}

export async function joinGame(token: string, roomCode: string): Promise<{ gameId: number; roomCode: string }> {
  const res = await fetch(`${API_URL}/games/${roomCode}/join`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Huoneeseen liittyminen epäonnistui');
  }
  return data;
}