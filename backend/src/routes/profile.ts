import { Router, Response } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { pool } from '../db/pool';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { validateEmail, validatePassword, validateUsername } from '../utils/validation';

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
    email: row.email,
    createdAt: row.created_at,
  };
}

async function loadUser(userId: number) {
  const result = await pool.query(
    'SELECT id, username, password_hash, email, avatar_emoji, avatar_color, avatar_image, created_at FROM users WHERE id = $1',
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
    // Peli on bottipeli, jos siinä ei ollut muita oikeita pelaajia.
    const myGames = `
      SELECT g.id, g.mode, g.created_at, g.wins_required, gp.wins, w.username AS winner,
             (g.winner_user_id = $1 OR (g.winner_user_id IS NULL AND gp.wins >= g.wins_required)) AS won,
             NOT EXISTS (SELECT 1 FROM game_players o WHERE o.game_id = g.id AND o.user_id <> $1) AS vs_bots
        FROM game_players gp
        JOIN games g ON g.id = gp.game_id
        LEFT JOIN users w ON w.id = g.winner_user_id
       WHERE gp.user_id = $1 AND g.status = 'finished'`;

    const games = await pool.query(
      `SELECT mode, vs_bots, COUNT(*)::int AS games, COUNT(*) FILTER (WHERE won)::int AS wins,
              COALESCE(SUM(wins), 0)::int AS round_wins
         FROM (${myGames}) mg GROUP BY mode, vs_bots`,
      [req.userId]
    );

    const symbols = await pool.query(
      `SELECT mode, vs_bots, symbol, SUM(count)::int AS count, SUM(wins)::int AS wins,
              SUM(losses)::int AS losses, SUM(draws)::int AS draws
         FROM stats WHERE user_id = $1 GROUP BY mode, vs_bots, symbol`,
      [req.userId]
    );

    const recent = await pool.query(`SELECT * FROM (${myGames}) mg ORDER BY id DESC LIMIT 5`, [req.userId]);

    // Vastustajat, joita vastaan on pelattu (oikeat pelaajat), pelimuodoittain
    const opponents = await pool.query(
      `SELECT mg.mode, u.username, COUNT(*)::int AS games, COUNT(*) FILTER (WHERE mg.won)::int AS wins
         FROM (${myGames}) mg
         JOIN game_players o ON o.game_id = mg.id AND o.user_id <> $1
         JOIN users u ON u.id = o.user_id
        GROUP BY mg.mode, u.username`,
      [req.userId]
    );

    res.json({
      profile: toProfile(user),
      stats: {
        games: games.rows.map(r => ({ mode: r.mode, vsBots: r.vs_bots, games: r.games, wins: r.wins, roundWins: r.round_wins })),
        symbols: symbols.rows.map(r => ({
          mode: r.mode, vsBots: r.vs_bots, symbol: r.symbol, count: r.count, wins: r.wins, losses: r.losses, draws: r.draws,
        })),
        recent: recent.rows.map(r => ({
          id: r.id, playedAt: r.created_at, mode: r.mode, winsRequired: r.wins_required,
          myWins: r.wins, won: !!r.won, winner: r.winner, vsBots: r.vs_bots,
        })),
        opponents: opponents.rows,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Palvelinvirhe' });
  }
});

// Nimimerkin ja profiilikuvan muokkaus
router.patch('/me', authenticateToken, async (req: AuthRequest, res: Response) => {
  const { username, avatarEmoji, avatarColor, avatarImage, email } = req.body ?? {};
  const updates: string[] = [];
  const values: unknown[] = [];
  const set = (column: string, value: unknown) => { values.push(value); updates.push(`${column} = $${values.length}`); };

  try {
    if (username !== undefined) {
      const checked = validateUsername(username);
      if (!checked.ok) return res.status(400).json({ error: checked.error });
      const name = checked.username;
      const taken = await pool.query('SELECT id FROM users WHERE LOWER(username) = LOWER($1) AND id <> $2', [name, req.userId]);
      if (taken.rows.length > 0) return res.status(409).json({ error: 'Nimimerkki on jo käytössä' });
      set('username', name);
    }
    if (email !== undefined) {
      const checked = validateEmail(email);
      if (!checked.ok) return res.status(400).json({ error: checked.error });
      if (checked.email) {
        const taken = await pool.query('SELECT id FROM users WHERE LOWER(email) = $1 AND id <> $2', [checked.email, req.userId]);
        if (taken.rows.length > 0) return res.status(409).json({ error: 'Sähköposti on jo käytössä toisella tunnuksella' });
      }
      set('email', checked.email);
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
        || !/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(avatarImage)
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
  const passwordError = validatePassword(password);
  if (passwordError) return res.status(400).json({ error: passwordError });

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

// Tilin ja kaikkien tietojen pysyvä poisto (GDPR: oikeus tulla unohdetuksi).
// Tietokannan viiteavaimet poistavat käyttäjän pelirivit, valinnat ja tilastot (ON DELETE CASCADE).
router.delete('/me', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    await pool.query('DELETE FROM users WHERE id = $1', [req.userId]);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Palvelinvirhe' });
  }
});

export default router;
