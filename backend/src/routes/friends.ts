import { Router, Response } from 'express';
import { pool } from '../db/pool';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { rateLimit } from '../middleware/rateLimit';
import { normalizeFriendCode } from '../utils/friendCode';
import { parseRoomCode } from '../utils/validation';
import { emitToUser, getPresence, isInRoom } from '../realtime/presence';
import { sendPush } from '../utils/push';
import { getHeadToHead, getUserStats, parseRange } from '../db/statsQueries';

const router = Router();
const GUEST_PASSWORD_MARKER = 'guest';
const INVITE_COOLDOWN_MS = 15 * 1000;
const lastInviteAt = new Map<string, number>();

router.use(authenticateToken);
// Koodien arvailun esto: haku ja pyynnöt rajoitetaan
const lookupLimit = rateLimit({ windowMs: 60 * 1000, max: 20, message: 'Liikaa hakuja — odota hetki' });

interface UserRow {
  id: number;
  username: string;
  password_hash: string;
  avatar_emoji: string | null;
  avatar_color: string | null;
  avatar_image: string | null;
}

function publicUser(row: UserRow) {
  return {
    id: row.id,
    username: row.username,
    avatarEmoji: row.avatar_emoji,
    avatarColor: row.avatar_color,
    avatarImage: row.avatar_image,
  };
}

async function loadUser(userId: number): Promise<UserRow | null> {
  const result = await pool.query(
    'SELECT id, username, password_hash, avatar_emoji, avatar_color, avatar_image FROM users WHERE id = $1',
    [userId]
  );
  return result.rows[0] ?? null;
}

// Kaverit ovat vain tunnuksellisille: vierastili katoaa selaimen tietojen mukana
async function requireAccount(req: AuthRequest, res: Response): Promise<UserRow | null> {
  const me = await loadUser(req.userId!);
  if (!me) { res.status(404).json({ error: 'Käyttäjää ei löytynyt' }); return null; }
  if (me.password_hash === GUEST_PASSWORD_MARKER) {
    res.status(403).json({ error: 'Kaverit vaativat tunnuksen — lisää salasana profiilissa' });
    return null;
  }
  return me;
}

async function getFriendship(a: number, b: number) {
  const result = await pool.query(
    `SELECT id, requester_id, addressee_id, status FROM friendships
      WHERE LEAST(requester_id, addressee_id) = LEAST($1::int, $2::int)
        AND GREATEST(requester_id, addressee_id) = GREATEST($1::int, $2::int)`,
    [a, b]
  );
  return result.rows[0] ?? null;
}

function relationFor(meId: number, friendship: any): 'none' | 'friends' | 'outgoing' | 'incoming' {
  if (!friendship) return 'none';
  if (friendship.status === 'accepted') return 'friends';
  return friendship.requester_id === meId ? 'outgoing' : 'incoming';
}

// Kaverilista, saapuneet ja lähetetyt pyynnöt sekä kavereiden paikallaolo
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT f.id AS friendship_id, f.status, f.requester_id, f.created_at,
              u.id, u.username, u.password_hash, u.avatar_emoji, u.avatar_color, u.avatar_image
         FROM friendships f
         JOIN users u ON u.id = CASE WHEN f.requester_id = $1 THEN f.addressee_id ELSE f.requester_id END
        WHERE f.requester_id = $1 OR f.addressee_id = $1
        ORDER BY u.username`,
      [req.userId]
    );
    const friends = [];
    const incoming = [];
    const outgoing = [];
    for (const row of result.rows) {
      const entry = { ...publicUser(row), friendshipId: row.friendship_id };
      if (row.status === 'accepted') friends.push({ ...entry, presence: getPresence(row.id) });
      else if (row.requester_id === req.userId) outgoing.push(entry);
      else incoming.push(entry);
    }
    // Paikalla olevat ensin
    const order = { playing: 0, online: 1, offline: 2 };
    friends.sort((a, b) => order[a.presence] - order[b.presence]);
    res.json({ friends, incoming, outgoing });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Palvelinvirhe' });
  }
});

// Haku kaverikoodilla: näyttää vain nimimerkin ja profiilikuvan
router.get('/lookup/:code', lookupLimit, async (req: AuthRequest, res: Response) => {
  const code = normalizeFriendCode(req.params.code);
  if (!code) return res.status(400).json({ error: 'Kaverikoodissa on 6 merkkiä, esim. K7M-4QX' });
  try {
    const result = await pool.query(
      'SELECT id, username, password_hash, avatar_emoji, avatar_color, avatar_image FROM users WHERE friend_code = $1',
      [code]
    );
    const row = result.rows[0];
    if (!row || row.password_hash === GUEST_PASSWORD_MARKER) return res.status(404).json({ error: 'Koodilla ei löytynyt pelaajaa' });
    if (row.id === req.userId) return res.json({ user: publicUser(row), relation: 'self' });
    const friendship = await getFriendship(req.userId!, row.id);
    res.json({ user: publicUser(row), relation: relationFor(req.userId!, friendship) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Palvelinvirhe' });
  }
});

// Kaveripyyntö koodilla. Jos toinen on jo pyytänyt sinua, pyyntö hyväksytään suoraan.
router.post('/requests', lookupLimit, async (req: AuthRequest, res: Response) => {
  const code = normalizeFriendCode(req.body?.code);
  if (!code) return res.status(400).json({ error: 'Virheellinen kaverikoodi' });
  try {
    const me = await requireAccount(req, res);
    if (!me) return;
    const target = (await pool.query('SELECT id, password_hash FROM users WHERE friend_code = $1', [code])).rows[0];
    if (!target || target.password_hash === GUEST_PASSWORD_MARKER) return res.status(404).json({ error: 'Koodilla ei löytynyt pelaajaa' });
    if (target.id === me.id) return res.status(400).json({ error: 'Et voi lisätä itseäsi kaveriksi' });

    const existing = await getFriendship(me.id, target.id);
    const relation = relationFor(me.id, existing);
    if (relation === 'friends') return res.json({ relation });
    if (relation === 'outgoing') return res.json({ relation });
    if (relation === 'incoming') {
      await pool.query("UPDATE friendships SET status = 'accepted', accepted_at = now() WHERE id = $1", [existing.id]);
      notifyAccepted(me, target.id);
      return res.json({ relation: 'friends' });
    }

    await pool.query('INSERT INTO friendships (requester_id, addressee_id) VALUES ($1, $2)', [me.id, target.id]);
    emitToUser(target.id, 'friends:request', { from: publicUser(me) });
    sendPush(target.id, {
      title: 'Uusi kaveripyyntö',
      body: `${me.username} haluaa kaveriksesi`,
      url: '/kaverit',
      tag: `friend-request-${me.id}`,
    }).catch(err => console.error(err));
    res.json({ relation: 'outgoing' });
  } catch (err: any) {
    if (err?.code === '23505') return res.json({ relation: 'outgoing' }); // samanaikainen tuplapyyntö
    console.error(err);
    res.status(500).json({ error: 'Palvelinvirhe' });
  }
});

function notifyAccepted(me: UserRow, requesterId: number) {
  emitToUser(requesterId, 'friends:accepted', { by: publicUser(me) });
  sendPush(requesterId, {
    title: 'Kaveripyyntö hyväksytty',
    body: `${me.username} hyväksyi kaveripyyntösi`,
    url: '/kaverit',
    tag: `friend-accepted-${me.id}`,
  }).catch(err => console.error(err));
}

// Saapuneen pyynnön hyväksyntä
router.post('/requests/:userId/accept', async (req: AuthRequest, res: Response) => {
  const otherId = Number(req.params.userId);
  if (!Number.isInteger(otherId)) return res.status(400).json({ error: 'Virheellinen pyyntö' });
  try {
    const me = await requireAccount(req, res);
    if (!me) return;
    const result = await pool.query(
      `UPDATE friendships SET status = 'accepted', accepted_at = now()
        WHERE requester_id = $1 AND addressee_id = $2 AND status = 'pending' RETURNING id`,
      [otherId, me.id]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'Pyyntöä ei löytynyt' });
    notifyAccepted(me, otherId);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Palvelinvirhe' });
  }
});

// Pyynnön hylkäys, oman pyynnön peruminen tai kaverin poisto
router.delete('/:userId', async (req: AuthRequest, res: Response) => {
  const otherId = Number(req.params.userId);
  if (!Number.isInteger(otherId)) return res.status(400).json({ error: 'Virheellinen pyyntö' });
  try {
    await pool.query(
      `DELETE FROM friendships
        WHERE LEAST(requester_id, addressee_id) = LEAST($1::int, $2::int)
          AND GREATEST(requester_id, addressee_id) = GREATEST($1::int, $2::int)`,
      [req.userId, otherId]
    );
    emitToUser(otherId, 'friends:changed', {});
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Palvelinvirhe' });
  }
});

// Kaverin julkinen profiili ja tilastot (?range=all|last5|last20|30d) — näkyy vain kavereille
router.get('/:userId/profile', async (req: AuthRequest, res: Response) => {
  const otherId = Number(req.params.userId);
  if (!Number.isInteger(otherId)) return res.status(400).json({ error: 'Virheellinen pyyntö' });
  try {
    const friendship = await getFriendship(req.userId!, otherId);
    if (relationFor(req.userId!, friendship) !== 'friends') {
      return res.status(403).json({ error: 'Profiili näkyy vain kavereille' });
    }
    const result = await pool.query(
      'SELECT id, username, avatar_emoji, avatar_color, avatar_image, bio, banner_image, created_at FROM users WHERE id = $1',
      [otherId]
    );
    const row = result.rows[0];
    if (!row) return res.status(404).json({ error: 'Pelaajaa ei löytynyt' });
    const [stats, headToHead] = await Promise.all([
      getUserStats(otherId, parseRange(req.query.range), { includeOpponents: false }),
      getHeadToHead(req.userId!, otherId),
    ]);
    res.json({
      profile: { ...publicUser(row), bio: row.bio, bannerImage: row.banner_image, createdAt: row.created_at, presence: getPresence(otherId) },
      stats,
      headToHead,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Palvelinvirhe' });
  }
});

// Pelikutsu kaverille: kutsujan pitää olla itse huoneessa
router.post('/:userId/invite', async (req: AuthRequest, res: Response) => {
  const otherId = Number(req.params.userId);
  const roomCode = parseRoomCode(req.body?.roomCode);
  if (!Number.isInteger(otherId) || !roomCode) return res.status(400).json({ error: 'Virheellinen kutsu' });
  try {
    const friendship = await getFriendship(req.userId!, otherId);
    if (relationFor(req.userId!, friendship) !== 'friends') return res.status(403).json({ error: 'Voit kutsua vain kavereita' });
    if (!isInRoom(req.userId!, roomCode)) return res.status(400).json({ error: 'Liity ensin huoneeseen' });

    const key = `${req.userId}:${otherId}`;
    const now = Date.now();
    if ((lastInviteAt.get(key) ?? 0) > now - INVITE_COOLDOWN_MS) return res.json({ ok: true, throttled: true });
    lastInviteAt.set(key, now);

    const me = await loadUser(req.userId!);
    if (!me) return res.status(404).json({ error: 'Käyttäjää ei löytynyt' });
    emitToUser(otherId, 'invite', { from: publicUser(me), roomCode, game: 'Kivi, paperi, sakset' });
    sendPush(otherId, {
      title: 'Pelikutsu',
      body: `${me.username} kutsuu sinut peliin: Kivi, paperi, sakset`,
      url: `/room/${roomCode}`,
      tag: `invite-${me.id}`,
    }).catch(err => console.error(err));
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Palvelinvirhe' });
  }
});

export default router;
