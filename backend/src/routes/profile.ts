import { Router, Response } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { pool } from '../db/pool';
import { authenticateToken, AuthRequest } from '../middleware/auth';

const router = Router();
const SALT_ROUNDS = 10;
const GUEST_PASSWORD_MARKER = 'guest';
const MAX_IMAGE_LENGTH = 200_000;

function signToken(user: { id: number; username: string }) {
  return jwt.sign({ userId: user.id, username: user.username }, process.env.JWT_SECRET!, { expiresIn: '30d' });
}

function toProfile(row: any) {
  return {
    id: row.id,
    username: row.username,
    isGuest: row.password_hash === GUEST_PASSWORD_MARKER,
    avatarEmoji: row.avatar_emoji,
    avatarColor: row.avatar_color,
    avatarImage: row.avatar_image,
    createdAt: row.created_at,
  };
}

async function loadUser(userId: number) {
  const result = await pool.query(
    'SELECT id, username, password_hash, avatar_emoji, avatar_color, avatar_image, created_at FROM users WHERE id = $1',
    [userId]
  );
  return result.rows[0] ?? null;
}

// Oma profiili ja tilastot
router.get('/me', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const user = await loadUser(req.userId!);
    if (!user) return res.status(404).json({ error: 'Käyttäjää ei löytynyt' });

    // Vanhoista peleistä ei ole voittajaa tallessa — silloin voittaja on se jolla on tarvittava määrä voittoja.
    // Tilastot lasketaan pelimuodoittain (klassinen / Lisko–Spock).
    const games = await pool.query(
      `SELECT g.mode,
              COUNT(*)::int AS games,
              COUNT(*) FILTER (
                WHERE g.winner_user_id = $1 OR (g.winner_user_id IS NULL AND gp.wins >= g.wins_required)
              )::int AS wins,
              COALESCE(SUM(gp.wins), 0)::int AS round_wins
         FROM game_players gp
         JOIN games g ON g.id = gp.game_id
        WHERE gp.user_id = $1 AND g.status = 'finished'
        GROUP BY g.mode`,
      [req.userId]
    );

    const symbols = await pool.query(
      `SELECT mode, symbol, SUM(count)::int AS count, SUM(wins)::int AS wins, SUM(losses)::int AS losses, SUM(draws)::int AS draws
         FROM stats WHERE user_id = $1 GROUP BY mode, symbol`,
      [req.userId]
    );

    const modeStats = (mode: string) => {
      const row = games.rows.find(r => r.mode === mode);
      return {
        games: row?.games ?? 0,
        wins: row?.wins ?? 0,
        roundWins: row?.round_wins ?? 0,
        symbols: symbols.rows.filter(r => r.mode === mode).map(({ mode: _mode, ...rest }) => rest),
      };
    };

    const recent = await pool.query(
      `SELECT g.id, g.created_at, g.mode, g.wins_required, gp.wins,
              (g.winner_user_id = $1 OR (g.winner_user_id IS NULL AND gp.wins >= g.wins_required)) AS won,
              w.username AS winner
         FROM game_players gp
         JOIN games g ON g.id = gp.game_id
         LEFT JOIN users w ON w.id = g.winner_user_id
        WHERE gp.user_id = $1 AND g.status = 'finished'
        ORDER BY g.id DESC
        LIMIT 5`,
      [req.userId]
    );

    res.json({
      profile: toProfile(user),
      stats: {
        byMode: { classic: modeStats('classic'), extended: modeStats('extended') },
        recent: recent.rows.map(r => ({
          id: r.id, playedAt: r.created_at, mode: r.mode, winsRequired: r.wins_required,
          myWins: r.wins, won: !!r.won, winner: r.winner,
        })),
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Palvelinvirhe' });
  }
});

// Nimimerkin ja profiilikuvan muokkaus
router.patch('/me', authenticateToken, async (req: AuthRequest, res: Response) => {
  const { username, avatarEmoji, avatarColor, avatarImage } = req.body ?? {};
  const updates: string[] = [];
  const values: unknown[] = [];
  const set = (column: string, value: unknown) => { values.push(value); updates.push(`${column} = $${values.length}`); };

  try {
    if (username !== undefined) {
      const name = typeof username === 'string' ? username.trim() : '';
      if (name.length < 2 || name.length > 20) return res.status(400).json({ error: 'Nimimerkin pituus 2–20 merkkiä' });
      const taken = await pool.query('SELECT id FROM users WHERE LOWER(username) = LOWER($1) AND id <> $2', [name, req.userId]);
      if (taken.rows.length > 0) return res.status(409).json({ error: 'Nimimerkki on jo käytössä' });
      set('username', name);
    }
    if (avatarEmoji !== undefined) {
      if (avatarEmoji !== null && (typeof avatarEmoji !== 'string' || avatarEmoji.length > 16)) {
        return res.status(400).json({ error: 'Virheellinen emoji' });
      }
      set('avatar_emoji', avatarEmoji);
    }
    if (avatarColor !== undefined) {
      if (avatarColor !== null && !/^#[0-9a-fA-F]{6}$/.test(avatarColor)) {
        return res.status(400).json({ error: 'Virheellinen väri' });
      }
      set('avatar_color', avatarColor);
    }
    if (avatarImage !== undefined) {
      if (avatarImage !== null && (
        typeof avatarImage !== 'string'
        || !/^data:image\/(jpeg|png|webp);base64,/.test(avatarImage)
        || avatarImage.length > MAX_IMAGE_LENGTH
      )) {
        return res.status(400).json({ error: 'Kuva on liian suuri tai väärää muotoa' });
      }
      set('avatar_image', avatarImage);
    }

    if (updates.length > 0) {
      values.push(req.userId);
      await pool.query(`UPDATE users SET ${updates.join(', ')} WHERE id = $${values.length}`, values);
    }

    const user = await loadUser(req.userId!);
    // Nimimerkki on mukana tunnisteessa, joten annetaan aina tuore tunniste
    res.json({ profile: toProfile(user), token: signToken(user) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Palvelinvirhe' });
  }
});

// Salasanan asetus: vieras tallentaa profiilinsa, tai tavallinen käyttäjä vaihtaa salasanan
router.post('/password', authenticateToken, async (req: AuthRequest, res: Response) => {
  const { password, currentPassword } = req.body ?? {};
  if (typeof password !== 'string' || password.length < 6) {
    return res.status(400).json({ error: 'Salasanan pituus vähintään 6 merkkiä' });
  }

  try {
    const user = await loadUser(req.userId!);
    if (!user) return res.status(404).json({ error: 'Käyttäjää ei löytynyt' });

    const isGuest = user.password_hash === GUEST_PASSWORD_MARKER;
    if (!isGuest) {
      const valid = typeof currentPassword === 'string' && await bcrypt.compare(currentPassword, user.password_hash);
      if (!valid) return res.status(401).json({ error: 'Nykyinen salasana on väärin' });
    }

    const hash = await bcrypt.hash(password, SALT_ROUNDS);
    await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, req.userId]);
    const updated = await loadUser(req.userId!);
    res.json({ profile: toProfile(updated) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Palvelinvirhe' });
  }
});

export default router;
