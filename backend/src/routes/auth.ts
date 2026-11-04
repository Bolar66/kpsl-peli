import { Router } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { pool } from '../db/pool';
import { rateLimit } from '../middleware/rateLimit';
import crypto from 'crypto';
import { validateEmail, validatePassword, validateUsername } from '../utils/validation';
import { sendMail } from '../utils/mailer';

const router = Router();
const SALT_ROUNDS = 10;

// Estää salasanojen arvailun ja tunnusten massaluonnin
router.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 30, message: 'Liikaa yrityksiä — odota hetki ja yritä uudelleen' }));

// Rekisteröinti
router.post('/register', async (req, res) => {
  const checked = validateUsername(req.body?.username, 3);
  if (!checked.ok) return res.status(400).json({ error: checked.error });
  const { username } = checked;
  const password = req.body?.password;
  const passwordError = validatePassword(password);
  if (passwordError) return res.status(400).json({ error: passwordError });
  const emailCheck = validateEmail(req.body?.email);
  if (!emailCheck.ok) return res.status(400).json({ error: emailCheck.error });
  const { email } = emailCheck;

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

    if (email) {
      const emailTaken = await pool.query('SELECT id FROM users WHERE LOWER(email) = $1', [email]);
      if (emailTaken.rows.length > 0) return res.status(409).json({ error: 'Sähköposti on jo käytössä toisella tunnuksella' });
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    const result = await pool.query(
      'INSERT INTO users (username, password_hash, email) VALUES ($1, $2, $3) RETURNING id, username',
      [username, passwordHash, email]
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
  const checked = validateUsername(req.body?.username);
  if (!checked.ok) return res.status(400).json({ error: checked.error });
  const { username } = checked;

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
  const { username, password } = req.body ?? {};

  if (typeof username !== 'string' || typeof password !== 'string' || !username || !password || password.length > 200) {
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

// ---------- Salasanan palautus ----------
const RESET_TTL_MS = 60 * 60 * 1000;
const hashToken = (token: string) => crypto.createHash('sha256').update(token).digest('hex');

// Palautuslinkin pyyntö nimimerkillä tai sähköpostilla. Vastaus on aina sama, jottei sillä voi
// selvittää mitkä tunnukset tai sähköpostit ovat olemassa.
router.post('/forgot', async (req, res) => {
  const identifier = typeof req.body?.identifier === 'string' ? req.body.identifier.trim() : '';
  const generic = { ok: true, message: 'Jos tunnukseen on liitetty sähköposti, lähetimme sinne palautuslinkin.' };
  if (!identifier || identifier.length > 254) return res.json(generic);

  try {
    const result = await pool.query(
      'SELECT id, username, email FROM users WHERE email IS NOT NULL AND (LOWER(username) = LOWER($1) OR LOWER(email) = LOWER($1))',
      [identifier]
    );
    const user = result.rows[0];
    if (user) {
      const token = crypto.randomBytes(32).toString('hex');
      await pool.query('UPDATE password_resets SET used_at = now() WHERE user_id = $1 AND used_at IS NULL', [user.id]);
      await pool.query(
        'INSERT INTO password_resets (user_id, token_hash, expires_at) VALUES ($1, $2, $3)',
        [user.id, hashToken(token), new Date(Date.now() + RESET_TTL_MS)]
      );
      // Linkki osoittaa sivulle josta pyyntö tehtiin (tai APP_URL:iin julkaistussa versiossa)
      const origin = process.env.APP_URL || req.get('origin') || `${req.protocol}://${req.get('host')}`;
      const link = `${origin}/palauta?token=${token}`;
      await sendMail(
        user.email,
        'BOWL — salasanan palautus',
        `Hei ${user.username}!\n\nVoit asettaa uuden salasanan tästä linkistä (voimassa tunnin):\n${link}\n\nJos et pyytänyt palautusta, voit jättää tämän viestin huomiotta.`
      );
    }
    res.json(generic);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Palvelinvirhe' });
  }
});

// Uuden salasanan asetus palautuslinkin tunnisteella
router.post('/reset', async (req, res) => {
  const token = typeof req.body?.token === 'string' ? req.body.token : '';
  const passwordError = validatePassword(req.body?.password);
  if (passwordError) return res.status(400).json({ error: passwordError });
  if (!/^[a-f0-9]{64}$/.test(token)) return res.status(400).json({ error: 'Palautuslinkki on virheellinen' });

  try {
    const result = await pool.query(
      'SELECT id, user_id FROM password_resets WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now()',
      [hashToken(token)]
    );
    const reset = result.rows[0];
    if (!reset) return res.status(400).json({ error: 'Palautuslinkki on vanhentunut tai jo käytetty. Pyydä uusi linkki.' });

    const passwordHash = await bcrypt.hash(req.body.password, SALT_ROUNDS);
    await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [passwordHash, reset.user_id]);
    await pool.query('UPDATE password_resets SET used_at = now() WHERE user_id = $1 AND used_at IS NULL', [reset.user_id]);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Palvelinvirhe' });
  }
});

export default router;