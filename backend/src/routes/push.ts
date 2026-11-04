import { Router, Response } from 'express';
import { pool } from '../db/pool';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { getPublicKey } from '../utils/push';

const router = Router();
const MAX_SUBSCRIPTIONS_PER_USER = 10;

// Julkinen avain, jolla selain luo tilauksen (null = ilmoitukset eivät ole käytössä palvelimella)
router.get('/key', (_req, res) => {
  res.json({ publicKey: getPublicKey() });
});

// Laitteen tilauksen tallennus. Sama laite (endpoint) siirtyy aina viimeisimmälle kirjautuneelle.
router.post('/subscribe', authenticateToken, async (req: AuthRequest, res: Response) => {
  const sub = req.body?.subscription;
  const endpoint = sub?.endpoint;
  const p256dh = sub?.keys?.p256dh;
  const auth = sub?.keys?.auth;
  const valid = typeof endpoint === 'string' && endpoint.startsWith('https://') && endpoint.length < 1000
    && typeof p256dh === 'string' && p256dh.length < 200 && typeof auth === 'string' && auth.length < 100;
  if (!valid) return res.status(400).json({ error: 'Virheellinen tilaus' });
  try {
    await pool.query(
      `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth) VALUES ($1, $2, $3, $4)
       ON CONFLICT (endpoint) DO UPDATE SET user_id = EXCLUDED.user_id, p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth`,
      [req.userId, endpoint, p256dh, auth]
    );
    // Vanhimmat tilaukset pois, jos laitteita on kertynyt paljon
    await pool.query(
      `DELETE FROM push_subscriptions WHERE user_id = $1 AND id NOT IN (
         SELECT id FROM push_subscriptions WHERE user_id = $1 ORDER BY id DESC LIMIT $2)`,
      [req.userId, MAX_SUBSCRIPTIONS_PER_USER]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Palvelinvirhe' });
  }
});

router.delete('/subscribe', authenticateToken, async (req: AuthRequest, res: Response) => {
  const endpoint = req.body?.endpoint;
  if (typeof endpoint !== 'string') return res.status(400).json({ error: 'Virheellinen pyyntö' });
  try {
    await pool.query('DELETE FROM push_subscriptions WHERE endpoint = $1 AND user_id = $2', [endpoint, req.userId]);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Palvelinvirhe' });
  }
});

export default router;
