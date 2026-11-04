import { pool } from './pool';

export type StatsRange = 'all' | 'last5' | 'last20' | '30d';

export function parseRange(value: unknown): StatsRange {
  return value === 'last5' || value === 'last20' || value === '30d' ? value : 'all';
}

// Käyttäjän päättyneet pelit. Vanhoista peleistä ei ole voittajaa tallessa — silloin voittaja on se,
// jolla on tarvittava määrä voittoja. Peli on bottipeli, jos siinä ei ollut muita oikeita pelaajia.
const USER_GAMES = `
  SELECT g.id, g.mode, g.created_at, g.wins_required, gp.wins, w.username AS winner,
         (g.winner_user_id = $1 OR (g.winner_user_id IS NULL AND gp.wins >= g.wins_required)) AS won,
         NOT EXISTS (SELECT 1 FROM game_players o WHERE o.game_id = g.id AND o.user_id <> $1) AS vs_bots
    FROM game_players gp
    JOIN games g ON g.id = gp.game_id
    LEFT JOIN users w ON w.id = g.winner_user_id
   WHERE gp.user_id = $1 AND g.status = 'finished'`;

// Aikaväli rajaa pelit: viimeiset N peliä tai viimeiset 30 päivää
function rangedGames(range: StatsRange) {
  if (range === 'last5') return `SELECT * FROM (${USER_GAMES}) ug ORDER BY id DESC LIMIT 5`;
  if (range === 'last20') return `SELECT * FROM (${USER_GAMES}) ug ORDER BY id DESC LIMIT 20`;
  if (range === '30d') return `SELECT * FROM (${USER_GAMES}) ug WHERE created_at > now() - interval '30 days'`;
  return USER_GAMES;
}

export async function getUserStats(userId: number, range: StatsRange, { includeOpponents }: { includeOpponents: boolean }) {
  const games = rangedGames(range);

  const summary = await pool.query(
    `SELECT mode, vs_bots, COUNT(*)::int AS games, COUNT(*) FILTER (WHERE won)::int AS wins,
            COALESCE(SUM(wins), 0)::int AS round_wins
       FROM (${games}) mg GROUP BY mode, vs_bots`,
    [userId]
  );

  // Koko historia tulee valmiiksi lasketusta stats-taulusta (kattaa myös ajalta ennen kierrosten
  // lopputuloksen tallennusta). Rajatut aikavälit lasketaan kierrosten valinnoista.
  const symbols = range === 'all'
    ? await pool.query(
      `SELECT mode, vs_bots, symbol, SUM(count)::int AS count, SUM(wins)::int AS wins,
              SUM(losses)::int AS losses, SUM(draws)::int AS draws,
              (SUM(wins) + SUM(losses) + SUM(draws))::int AS decided
         FROM stats WHERE user_id = $1 GROUP BY mode, vs_bots, symbol`,
      [userId]
    )
    : await pool.query(
      `SELECT mg.mode, mg.vs_bots, rp.symbol, COUNT(*)::int AS count,
              COUNT(*) FILTER (WHERE rp.outcome = 'win')::int AS wins,
              COUNT(*) FILTER (WHERE rp.outcome = 'loss')::int AS losses,
              COUNT(*) FILTER (WHERE rp.outcome = 'draw')::int AS draws,
              COUNT(rp.outcome)::int AS decided
         FROM (${games}) mg
         JOIN rounds r ON r.game_id = mg.id
         JOIN round_picks rp ON rp.round_id = r.id AND rp.user_id = $1 AND NOT rp.is_bot_pick
        GROUP BY mg.mode, mg.vs_bots, rp.symbol`,
      [userId]
    );

  const recent = await pool.query(`SELECT * FROM (${games}) mg ORDER BY id DESC LIMIT 5`, [userId]);

  const opponents = includeOpponents
    ? (await pool.query(
      `SELECT mg.mode, u.username, COUNT(*)::int AS games, COUNT(*) FILTER (WHERE mg.won)::int AS wins
         FROM (${games}) mg
         JOIN game_players o ON o.game_id = mg.id AND o.user_id <> $1
         JOIN users u ON u.id = o.user_id
        GROUP BY mg.mode, u.username`,
      [userId]
    )).rows
    : [];

  return {
    range,
    games: summary.rows.map(r => ({ mode: r.mode, vsBots: r.vs_bots, games: r.games, wins: r.wins, roundWins: r.round_wins })),
    symbols: symbols.rows.map(r => ({
      mode: r.mode, vsBots: r.vs_bots, symbol: r.symbol, count: r.count, wins: r.wins, losses: r.losses, draws: r.draws,
      // Kierrokset, joiden lopputulos tiedetään (vanhoilta kierroksilta se puuttuu rajatuissa aikaväleissä)
      decided: r.decided,
    })),
    recent: recent.rows.map(r => ({
      id: r.id, playedAt: r.created_at, mode: r.mode, winsRequired: r.wins_required,
      myWins: r.wins, won: !!r.won, winner: r.winner, vsBots: r.vs_bots,
    })),
    opponents,
  };
}

// Keskinäiset ottelut: yhteiset päättyneet pelit ja kummankin voitot niistä
export async function getHeadToHead(meId: number, otherId: number) {
  const result = await pool.query(
    `SELECT COUNT(*)::int AS games,
            COUNT(*) FILTER (WHERE g.winner_user_id = $1 OR (g.winner_user_id IS NULL AND me.wins >= g.wins_required))::int AS my_wins,
            COUNT(*) FILTER (WHERE g.winner_user_id = $2 OR (g.winner_user_id IS NULL AND them.wins >= g.wins_required))::int AS their_wins
       FROM games g
       JOIN game_players me ON me.game_id = g.id AND me.user_id = $1
       JOIN game_players them ON them.game_id = g.id AND them.user_id = $2
      WHERE g.status = 'finished'`,
    [meId, otherId]
  );
  const row = result.rows[0];
  return { games: row.games, myWins: row.my_wins, theirWins: row.their_wins };
}

// ---------- Lippuvisa ----------

// Käyttäjän lippuvisapelit aikavälin mukaan
function flagGames(range: StatsRange) {
  const base = `
    SELECT g.id, g.level, g.question_count, g.solo, g.created_at, fp.score, fp.correct, fp.half, fp.answer_ms, fp.placement,
           (SELECT COUNT(*) FROM flag_game_players o WHERE o.game_id = g.id) AS players
      FROM flag_game_players fp
      JOIN flag_games g ON g.id = fp.game_id
     WHERE fp.user_id = $1`;
  if (range === 'last5') return `SELECT * FROM (${base}) fg ORDER BY id DESC LIMIT 5`;
  if (range === 'last20') return `SELECT * FROM (${base}) fg ORDER BY id DESC LIMIT 20`;
  if (range === '30d') return `SELECT * FROM (${base}) fg WHERE created_at > now() - interval '30 days'`;
  return base;
}

// Tasoittain: pelit, moninpelien voitot, oikeiden osuus, keskimääräinen vastausaika ja yksinpelin ennätykset
export async function getFlagStats(userId: number, range: StatsRange) {
  const result = await pool.query(
    `SELECT level,
            COUNT(*)::int AS games,
            COUNT(*) FILTER (WHERE NOT solo AND players > 1)::int AS multi_games,
            COUNT(*) FILTER (WHERE NOT solo AND players > 1 AND placement = 1)::int AS wins,
            COALESCE(SUM(correct), 0)::int AS correct,
            COALESCE(SUM(half), 0)::int AS half,
            COALESCE(SUM(question_count), 0)::int AS questions,
            COALESCE(SUM(answer_ms), 0)::bigint AS answer_ms,
            MAX(score) FILTER (WHERE solo)::int AS best_solo
       FROM (${flagGames(range)}) fg
      GROUP BY level`,
    [userId]
  );
  return result.rows.map(r => ({
    level: r.level,
    games: r.games,
    multiGames: r.multi_games,
    wins: r.wins,
    correct: r.correct,
    half: r.half,
    questions: r.questions,
    // Keskimääräinen aika oikeaan vastaukseen millisekunteina
    avgAnswerMs: r.correct > 0 ? Math.round(Number(r.answer_ms) / r.correct) : null,
    bestSolo: r.best_solo,
  }));
}

// Lippuvisan keskinäiset ottelut: yhteiset moninpelit ja kummankin parempi sijoitus
export async function getFlagHeadToHead(meId: number, otherId: number) {
  const result = await pool.query(
    `SELECT COUNT(*)::int AS games,
            COUNT(*) FILTER (WHERE me.placement < them.placement)::int AS my_wins,
            COUNT(*) FILTER (WHERE them.placement < me.placement)::int AS their_wins
       FROM flag_game_players me
       JOIN flag_game_players them ON them.game_id = me.game_id AND them.user_id = $2
      WHERE me.user_id = $1`,
    [meId, otherId]
  );
  const row = result.rows[0];
  return { games: row.games, myWins: row.my_wins, theirWins: row.their_wins };
}
