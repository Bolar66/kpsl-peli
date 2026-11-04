import { Router, Response } from 'express';
import { pool } from '../db/pool';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { rateLimit } from '../middleware/rateLimit';
import { sendMail } from '../utils/mailer';

const router = Router();
const CATEGORIES = new Set(['bug', 'idea', 'other']);
const CATEGORY_LABEL: Record<string, string> = { bug: 'Bugi', idea: 'Idea', other: 'Muu' };
const MAX_MESSAGE = 1000;

router.use(rateLimit({ windowMs: 10 * 60 * 1000, max: 8, message: 'Kiitos palautteista! Odota hetki ennen seuraavaa.' }));

// Palaute tallennetaan tietokantaan ja lähetetään ylläpitäjälle sähköpostina, jos FEEDBACK_EMAIL on asetettu
router.post('/', authenticateToken, async (req: AuthRequest, res: Response) => {
  const { category, message, page } = req.body ?? {};
  if (typeof category !== 'string' || !CATEGORIES.has(category)) return res.status(400).json({ error: 'Valitse palautteen tyyppi' });
  if (typeof message !== 'string' || !message.trim()) return res.status(400).json({ error: 'Kirjoita palaute' });
  const text = message.trim().slice(0, MAX_MESSAGE);
  const pagePath = typeof page === 'string' ? page.slice(0, 200) : null;
  const userAgent = (req.get('user-agent') ?? '').slice(0, 300);

  try {
    await pool.query(
      'INSERT INTO feedback (user_id, category, message, page, user_agent) VALUES ($1, $2, $3, $4, $5)',
      [req.userId, category, text, pagePath, userAgent]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Palautteen tallennus epäonnistui' });
  }

  const to = process.env.FEEDBACK_EMAIL;
  if (to) {
    sendMail(
      to,
      `KPSL-palaute: ${CATEGORY_LABEL[category]} (${req.username})`,
      `${text}\n\n— ${req.username}\nSivu: ${pagePath ?? '-'}\nLaite: ${userAgent}`
    ).catch(err => console.error('Palautesähköposti epäonnistui', err));
  }
});

export default router;
