import { Router, Response } from 'express';
import path from 'path';
import fs from 'fs';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { getRecords, parseLevel, resolveImageToken } from '../flags/engine';

const router = Router();

// Lippukuvat haetaan satunnaisella tunnisteella, jottei kuvan osoite paljasta oikeaa vastausta.
// Tuotannossa kuvat ovat frontendin buildissa, kehityksessä public-kansiossa.
const FLAG_DIRS = [
  path.join(__dirname, '../../../frontend/dist/flags'),
  path.join(__dirname, '../../../frontend/public/flags'),
];

router.get('/img/:token', (req, res) => {
  const code = resolveImageToken(req.params.token);
  if (!code || !/^[a-z]{2}(-[a-z]{3})?$/.test(code)) return res.status(404).end();
  const file = FLAG_DIRS.map(dir => path.join(dir, `${code}.svg`)).find(f => fs.existsSync(f));
  if (!file) return res.status(404).end();
  res.setHeader('Cache-Control', 'private, max-age=3600');
  res.type('image/svg+xml').sendFile(file);
});

// Yksinpelin ennätykset: oma ja kavereiden paras tulos tasolle ja pituudelle
router.get('/records', authenticateToken, async (req: AuthRequest, res: Response) => {
  const level = parseLevel(req.query.level);
  const count = Number(req.query.count);
  if (!level || ![10, 15, 20].includes(count)) return res.status(400).json({ error: 'Virheellinen pyyntö' });
  try {
    res.json({ records: await getRecords(req.userId!, level, count) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Palvelinvirhe' });
  }
});

export default router;
