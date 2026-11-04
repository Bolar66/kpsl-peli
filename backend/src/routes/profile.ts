import { Router, Response } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { pool } from '../db/pool';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { validateEmail, validatePassword, validateUsername } from '../utils/validation';
import { getUserStats, parseRange } from '../db/statsQueries';
import { assignFriendCode } from '../utils/friendCode';

const router = Router();
const SALT_ROUNDS = 10;
const GUEST_PASSWORD_MARKER = 'guest';
const MAX_IMAGE_LENGTH = 200_000;
const MAX_BANNER_LENGTH = 400_000;
const MAX_BIO_LENGTH = 80;
const IMAGE_DATA_URL = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;

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
    friendCode: row.password_hash === GUEST_PASSWORD_MARKER ? null : row.friend_code,
    bio: row.bio,
    bannerImage: row.banner_image,
    createdAt: row.created_at,
  };
}

async function loadUser(userId: number) {
  const result = await pool.query(
    'SELECT id, username, password_hash, email, avatar_emoji, avatar_color, avatar_image, friend_code, bio, banner_image, created_at FROM users WHERE id = $1',
    [userId]
  );
  return result.rows[0] ?? null;
}

// Oma profiili ja tilastot (?range=all|last5|last20|30d)
router.get('/me', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const user = await loadUser(req.userId!);
    if (!user) return res.status(404).json({ error: 'Käyttäjää ei löytynyt' });
    // Tunnukselliselle annetaan kaverikoodi ensimmäisellä kerralla
    if (!user.friend_code && user.password_hash !== GUEST_PASSWORD_MARKER) {
      user.friend_code = await assignFriendCode(user.id);
    }
    const stats = await getUserStats(req.userId!, parseRange(req.query.range), { includeOpponents: true });
    res.json({ profile: toProfile(user), stats });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Palvelinvirhe' });
  }
});

// Kaverikoodin vaihto uuteen (vanha lakkaa toimimasta)
router.post('/friend-code', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const user = await loadUser(req.userId!);
    if (!user) return res.status(404).json({ error: 'Käyttäjää ei löytynyt' });
    if (user.password_hash === GUEST_PASSWORD_MARKER) return res.status(403).json({ error: 'Kaverikoodi vaatii tunnuksen' });
    const friendCode = await assignFriendCode(user.id);
    res.json({ friendCode });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Palvelinvirhe' });
  }
});

// Nimimerkin ja profiilikuvan muokkaus
router.patch('/me', authenticateToken, async (req: AuthRequest, res: Response) => {
  const { username, avatarEmoji, avatarColor, avatarImage, email, bio, bannerImage } = req.body ?? {};
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
        || !IMAGE_DATA_URL.test(avatarImage)
        || avatarImage.length > MAX_IMAGE_LENGTH
      )) {
        return res.status(400).json({ error: 'Kuva on liian suuri tai väärää muotoa' });
      }
      set('avatar_image', avatarImage);
    }
    if (bio !== undefined) {
      if (bio !== null && typeof bio !== 'string') return res.status(400).json({ error: 'Virheellinen bio' });
      // Ohjausmerkit ja näkymättömät merkit pois, rivinvaihdot välilyönneiksi
      const clean = typeof bio === 'string'
        ? bio.replace(/[\u0000-\u001f\u007f\u200b\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, ' ').replace(/\s+/g, ' ').trim()
        : '';
      if (clean.length > MAX_BIO_LENGTH) return res.status(400).json({ error: `Bio voi olla enintään ${MAX_BIO_LENGTH} merkkiä` });
      set('bio', clean || null);
    }
    if (bannerImage !== undefined) {
      if (bannerImage !== null && (typeof bannerImage !== 'string' || !IMAGE_DATA_URL.test(bannerImage) || bannerImage.length > MAX_BANNER_LENGTH)) {
        return res.status(400).json({ error: 'Taustakuva on liian suuri tai väärää muotoa' });
      }
      set('banner_image', bannerImage);
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
