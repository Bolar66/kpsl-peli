import { Router } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { pool } from '../db/pool';
import { rateLimit } from '../middleware/rateLimit';

const router = Router();
const SALT_ROUNDS = 10;

// Estää salasanojen arvailun ja tunnusten massaluonnin
router.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 30, message: 'Liikaa yrityksiä — odota hetki ja yritä uudelleen' }));

// Rekisteröinti
router.post('/register', async (req, res) => {
  const username = typeof req.body.username === 'string' ? req.body.username.trim() : '';
  const { password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Käyttäjätunnus ja salasana vaaditaan' });
  }
  if (username.length < 3 || username.length > 20) {
    return res.status(400).json({ error: 'Käyttäjätunnuksen pituus 3-20 merkkiä' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'Salasanan pituus vähintään 6 merkkiä' });
  }

  try {
    const existing = await pool.query('SELECT id FROM users WHERE LOWER(username) = LOWER($1)', [username]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'Käyttäjätunnus on jo käytössä' });
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    const result = await pool.query(
      'INSERT INTO users (username, password_hash) VALUES ($1, $2) RETURNING id, username',
      [username, passwordHash]
    );

    const user = result.rows[0];
    const token = jwt.sign({ userId: user.id, username: user.username }, process.env.JWT_SECRET!, {
      expiresIn: '30d',
    });

    res.status(201).json({ token, user: { id: user.id, username: user.username } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Palvelinvirhe' });
  }
});

// Vieraana pelaaminen: pelkkä nimimerkki, ei salasanaa. Tunnukselle tallennetaan merkintä
// salasanan paikalle, joten sillä ei voi kirjautua salasanalla.
const GUEST_PASSWORD_MARKER = 'guest';

router.post('/guest', async (req, res) => {
  const username = typeof req.body.username === 'string' ? req.body.username.trim() : '';

  if (username.length < 2 || username.length > 20) {
    return res.status(400).json({ error: 'Nimimerkin pituus 2–20 merkkiä' });
  }

  try {
    const existing = await pool.query('SELECT id FROM users WHERE LOWER(username) = LOWER($1)', [username]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'Nimimerkki on jo käytössä — valitse toinen' });
    }

    const result = await pool.query(
      'INSERT INTO users (username, password_hash) VALUES ($1, $2) RETURNING id, username',
      [username, GUEST_PASSWORD_MARKER]
    );
    const user = result.rows[0];
    const token = jwt.sign({ userId: user.id, username: user.username }, process.env.JWT_SECRET!, {
      expiresIn: '30d',
    });

    res.status(201).json({ token, user: { id: user.id, username: user.username } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Palvelinvirhe' });
  }
});

// Kirjautuminen
router.post('/login', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Käyttäjätunnus ja salasana vaaditaan' });
  }

  try {
    const result = await pool.query('SELECT id, username, password_hash, avatar_emoji, avatar_color, avatar_image FROM users WHERE username = $1', [username]);
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Väärä käyttäjätunnus tai salasana' });
    }

    const user = result.rows[0];
    // Vierastunnuksella ei ole salasanaa
    const validPassword = user.password_hash !== GUEST_PASSWORD_MARKER && await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      return res.status(401).json({ error: 'Väärä käyttäjätunnus tai salasana' });
    }

    const token = jwt.sign({ userId: user.id, username: user.username }, process.env.JWT_SECRET!, {
      expiresIn: '30d',
    });

    res.json({
      token,
      user: {
        id: user.id, username: user.username,
        avatarEmoji: user.avatar_emoji, avatarColor: user.avatar_color, avatarImage: user.avatar_image,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Palvelinvirhe' });
  }
});

export default router;