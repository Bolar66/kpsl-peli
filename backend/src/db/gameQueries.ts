import { pool } from './pool';
import { generateRoomCode } from '../utils/roomCode';

export async function getGameIdByRoomCode(roomCode: string): Promise<number | null> {
  const result = await pool.query(
    'SELECT id FROM games WHERE room_code = $1 ORDER BY id DESC LIMIT 1',
    [roomCode]
  );
  return result.rows[0]?.id ?? null;
}

export async function saveRound(
  gameId: number,
  roundNumber: number,
  picks: { userId: number; symbol: string | null; isBot: boolean }[]
): Promise<void> {
  const roundResult = await pool.query(
    'INSERT INTO rounds (game_id, round_number, resolved_at) VALUES ($1, $2, now()) RETURNING id',
    [gameId, roundNumber]
  );
  const roundId = roundResult.rows[0].id;

  for (const pick of picks) {
    if (pick.symbol === null) continue;
    await pool.query(
      'INSERT INTO round_picks (round_id, user_id, symbol, is_bot_pick) VALUES ($1, $2, $3, $4)',
      [roundId, pick.userId, pick.symbol, pick.isBot]
    );
  }
}

interface SymbolStat {
  count: number;
  wins: number;
  losses: number;
  draws: number;
}

export async function finalizeGame(
  gameId: number,
  mode: string,
  playerWins: { userId: number; wins: number }[],
  symbolStats: Record<number, Record<string, SymbolStat>>
): Promise<void> {
  await pool.query('UPDATE games SET status = $1 WHERE id = $2', ['finished', gameId]);

  for (const { userId, wins } of playerWins) {
    await pool.query(
      'UPDATE game_players SET wins = $1 WHERE game_id = $2 AND user_id = $3',
      [wins, gameId, userId]
    );
  }

  for (const userIdStr of Object.keys(symbolStats)) {
    const userId = parseInt(userIdStr);
    for (const symbol of Object.keys(symbolStats[userId]!)) {
      const s = symbolStats[userId]![symbol]!;
      await pool.query(
        `INSERT INTO stats (user_id, mode, symbol, count, wins, losses, draws)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (user_id, mode, symbol) DO UPDATE SET
           count = stats.count + EXCLUDED.count,
           wins = stats.wins + EXCLUDED.wins,
           losses = stats.losses + EXCLUDED.losses,
           draws = stats.draws + EXCLUDED.draws`,
        [userId, mode, symbol, s.count, s.wins, s.losses, s.draws]
      );
    }
  }
}

// Luo kokonaan uuden games-rivin uusinnalle (eri room_code teknisesti, koska sarake on uniikki),
// mutta pelaajille näkyvä socket-huonekoodi pysyy koko ajan samana.
export async function createGameRow(
  mode: string,
  winsRequired: number,
  hostUserId: number,
  playerUserIds: number[]
): Promise<number> {
  let dbRoomCode = generateRoomCode();
  let exists = await pool.query('SELECT id FROM games WHERE room_code = $1', [dbRoomCode]);
  while (exists.rows.length > 0) {
    dbRoomCode = generateRoomCode();
    exists = await pool.query('SELECT id FROM games WHERE room_code = $1', [dbRoomCode]);
  }

  const result = await pool.query(
    `INSERT INTO games (room_code, mode, wins_required, host_user_id, status)
     VALUES ($1, $2, $3, $4, 'lobby') RETURNING id`,
    [dbRoomCode, mode, winsRequired, hostUserId]
  );
  const gameId = result.rows[0].id;

  for (const userId of playerUserIds) {
    await pool.query('INSERT INTO game_players (game_id, user_id) VALUES ($1, $2)', [gameId, userId]);
  }

  return gameId;
}