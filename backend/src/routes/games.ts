import { Router, Response } from 'express';
import { pool } from '../db/pool';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { generateRoomCode } from '../utils/roomCode';

const router = Router();

// Luo huone
router.post('/', authenticateToken, async (req: AuthRequest, res: Response) => {
  const { mode, winsRequired } = req.body;

  if (!mode || !['classic', 'extended'].includes(mode)) {
    return res.status(400).json({ error: 'Moodi vaaditaan (classic tai extended)' });
  }
  if (!winsRequired || winsRequired < 1) {
    return res.status(400).json({ error: 'wins_required vaaditaan (väh. 1)' });
  }

  try {
    let roomCode = generateRoomCode();
    // Varmistetaan ettei koodi ole jo käytössä
    let exists = await pool.query('SELECT id FROM games WHERE room_code = $1 AND status != $2', [roomCode, 'finished']);
    while (exists.rows.length > 0) {
      roomCode = generateRoomCode();
      exists = await pool.query('SELECT id FROM games WHERE room_code = $1 AND status != $2', [roomCode, 'finished']);
    }

    const result = await pool.query(
      `INSERT INTO games (room_code, mode, wins_required, host_user_id, status)
       VALUES ($1, $2, $3, $4, 'lobby') RETURNING id, room_code, mode, wins_required, status`,
      [roomCode, mode, winsRequired, req.userId]
    );
    const game = result.rows[0];

    // Host liittyy automaattisesti pelaajaksi
    await pool.query(
      'INSERT INTO game_players (game_id, user_id) VALUES ($1, $2)',
      [game.id, req.userId]
    );

    res.status(201).json({ game });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Palvelinvirhe' });
  }
});

// Liity huoneeseen
router.post('/:roomCode/join', authenticateToken, async (req: AuthRequest, res: Response) => {
  const { roomCode } = req.params;

  try {
    const gameResult = await pool.query(
      'SELECT id, status FROM games WHERE room_code = $1',
      [roomCode.toUpperCase()]
    );
    if (gameResult.rows.length === 0) {
      return res.status(404).json({ error: 'Huonetta ei löytynyt' });
    }
    const game = gameResult.rows[0];

    if (game.status !== 'lobby') {
      return res.status(400).json({ error: 'Peli on jo alkanut tai päättynyt' });
    }

    const playerCount = await pool.query('SELECT COUNT(*) FROM game_players WHERE game_id = $1', [game.id]);
    if (parseInt(playerCount.rows[0].count) >= 4) {
      return res.status(400).json({ error: 'Huone on täynnä' });
    }

    const existing = await pool.query(
      'SELECT id FROM game_players WHERE game_id = $1 AND user_id = $2',
      [game.id, req.userId]
    );
    if (existing.rows.length === 0) {
      await pool.query(
        'INSERT INTO game_players (game_id, user_id) VALUES ($1, $2)',
        [game.id, req.userId]
      );
    }

    res.json({ gameId: game.id, roomCode });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Palvelinvirhe' });
  }
});

export default router;