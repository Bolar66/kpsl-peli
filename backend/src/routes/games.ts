import { Router, Response } from 'express';
import { pool } from '../db/pool';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { generateRoomCode } from '../utils/roomCode';
import { getLatestGameByRoomCode } from '../db/gameQueries';

const router = Router();

// Luo huone
router.post('/', authenticateToken, async (req: AuthRequest, res: Response) => {
  const { mode, winsRequired } = req.body;

  if (!mode || !['classic', 'extended'].includes(mode)) {
    return res.status(400).json({ error: 'Moodi vaaditaan (classic tai extended)' });
  }
  if (!Number.isInteger(winsRequired) || winsRequired < 1 || winsRequired > 10) {
    return res.status(400).json({ error: 'Voittorajan pitää olla 1–10' });
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
  const roomCode = String(req.params.roomCode).toUpperCase();

  try {
    const game = await getLatestGameByRoomCode(roomCode);
    if (!game) {
      return res.status(404).json({ error: 'Huonetta ei löytynyt' });
    }

    // Käynnissä olevan huoneen tila on palvelimen muistissa (index.ts); se ratkaisee voiko liittyä.
    // Jos huone ei ole muistissa, päätetään tietokannan tilan perusteella.
    const getRoomJoinError: (code: string, userId: number) => string | null | undefined = req.app.locals.getRoomJoinError;
    const joinError = getRoomJoinError(roomCode, req.userId!);
    if (joinError) {
      return res.status(400).json({ error: joinError });
    }
    if (joinError === undefined && game.status !== 'lobby') {
      return res.status(400).json({ error: 'Tämä peli on jo päättynyt' });
    }

    await pool.query(
      'INSERT INTO game_players (game_id, user_id) VALUES ($1, $2) ON CONFLICT (game_id, user_id) DO NOTHING',
      [game.id, req.userId]
    );

    res.json({ gameId: game.id, roomCode });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Palvelinvirhe' });
  }
});

export default router;