import { randomBytes } from 'crypto';
import type { Namespace, Socket } from 'socket.io';
import { pool } from '../db/pool';
import { generateRoomCode } from '../utils/roomCode';
import { parseRoomCode } from '../utils/validation';
import { CHAT_HISTORY, EMOTES, cleanChatText, nextChatId, type ChatMessage } from '../utils/chat';
import { addRoomResolvers } from '../realtime/presence';
import {
  DEFAULT_EXTRAS, DEFAULT_HINTS, LEVEL_LABEL, checkAnswer, countryByCode, fiftyFiftyHint, generateQuestions, letterHint,
  scoreAnswer, type Correctness, type Extra, type Question, type QuizLevel,
} from './quiz';
import { COUNTRIES } from './countries';

// Lippuvisan pelimoottori: huoneet, kysymysten kulku, pisteet, vinkit ja chat (/flags-nimiavaruus).
// Sama moottori hoitaa yksinpelin (huone yhdelle) ja moninpelin.

interface AuthedSocket extends Socket {
  userId?: number;
  username?: string;
}

interface Settings {
  level: QuizLevel;
  count: number;
  hints: number;
  extras: Extra[];
  choiceSeconds: number;
  writeSeconds: number;
}

interface Answer {
  correctness: Correctness;
  points: number;
  elapsedMs: number;
  label: string;
  // Putkibonus sisältyy pisteisiin; kerrotaan erikseen paljastuksessa
  streakBonus?: number;
  streak?: number;
}

interface Player {
  userId: number;
  username: string;
  avatarEmoji: string | null;
  avatarColor: string | null;
  avatarImage: string | null;
  sockets: Set<string>;
  score: number;
  correct: number;
  half: number;
  answered: number;
  answerMs: number;
  hintsLeft: number;
  // Kysymyskohtaiset tulokset pelin lopun koostetta varten
  results: (Answer | null)[];
  usedHints: Set<string>;
  streak: number;
}

type Phase = 'lobby' | 'starting' | 'question' | 'reveal' | 'over';

interface Room {
  code: string;
  hostId: number;
  solo: boolean;
  settings: Settings;
  phase: Phase;
  players: Map<number, Player>;
  questions: Question[];
  index: number;
  questionStartedAt: number;
  // Lippukuvien satunnaiset tunnisteet: kuvan osoite ei paljasta maata
  images: { flag?: string; options?: string[] };
  answers: Map<number, Answer>;
  timer?: NodeJS.Timeout;
  chat: ChatMessage[];
  lastReveal: unknown;
  lastOver: unknown;
  emptySince: number | null;
  // Seuraava ajastettu siirtymä; tauko pysäyttää sen ja jatkaa jäljellä olevalla ajalla
  scheduled: { fn: () => void; dueAt: number } | null;
  paused: { byName: string; ready: Set<number>; at: number; remainingMs: number } | null;
  // Harjoitus: pelataan vain annetut liput, eikä tulosta tallenneta
  practice: string[] | null;
}

const LEVELS: QuizLevel[] = ['tourist', 'backpacker', 'globetrotter', 'lottery'];
const EXTRAS: Extra[] = ['flagChoice', 'reveal', 'piece', 'trueFalse'];
const COUNTS = [10, 15, 20];
const HINT_COUNTS = [0, 1, 3, 5];
const CHOICE_SECONDS = [5, 10, 15];
const WRITE_SECONDS = [10, 20, 30];
const MAX_PRACTICE = 20;
const STREAK_STEP = 10;
const MAX_STREAK_BONUS = 50;
const MAX_PLAYERS = 8;
const REVEAL_MS = 3500;
const SOLO_REVEAL_MS = 2200;
const FIRST_QUESTION_DELAY_MS = 2500;
const EMPTY_ROOM_TTL_MS = 2 * 60 * 1000;
const IMAGE_TTL_MS = 3 * 60 * 60 * 1000;

const rooms = new Map<string, Room>();
const VALID_CODES = new Set(COUNTRIES.map(c => c.code));
const imageTokens = new Map<string, { code: string; expires: number }>();
let ns: Namespace | null = null;

// ---------- Lippukuvat ----------
function imageToken(code: string): string {
  const token = randomBytes(12).toString('hex');
  imageTokens.set(token, { code, expires: Date.now() + IMAGE_TTL_MS });
  return token;
}

export function resolveImageToken(token: string): string | null {
  const entry = imageTokens.get(token);
  if (!entry || entry.expires < Date.now()) return null;
  return entry.code;
}

setInterval(() => {
  const now = Date.now();
  for (const [token, entry] of imageTokens) if (entry.expires < now) imageTokens.delete(token);
  for (const room of rooms.values()) {
    if (room.emptySince && now - room.emptySince > EMPTY_ROOM_TTL_MS) destroyRoom(room);
  }
}, 60 * 1000).unref();

// ---------- Apufunktiot ----------
function defaultSettings(level: QuizLevel = 'tourist'): Settings {
  return { level, count: 10, hints: DEFAULT_HINTS[level], extras: [...DEFAULT_EXTRAS[level]], choiceSeconds: 10, writeSeconds: 20 };
}

function sanitizeSettings(input: any, current: Settings): Settings {
  const level: QuizLevel = LEVELS.includes(input?.level) ? input.level : current.level;
  const levelChanged = level !== current.level;
  return {
    level,
    count: COUNTS.includes(input?.count) ? input.count : current.count,
    // Tason vaihto palauttaa tason oletusvinkit ja -lisätavat, ellei niitä annettu samalla
    hints: HINT_COUNTS.includes(input?.hints) ? input.hints : levelChanged ? DEFAULT_HINTS[level] : current.hints,
    extras: Array.isArray(input?.extras)
      ? EXTRAS.filter(e => input.extras.includes(e))
      : levelChanged ? [...DEFAULT_EXTRAS[level]] : current.extras,
    choiceSeconds: CHOICE_SECONDS.includes(input?.choiceSeconds) ? input.choiceSeconds : current.choiceSeconds,
    writeSeconds: WRITE_SECONDS.includes(input?.writeSeconds) ? input.writeSeconds : current.writeSeconds,
  };
}

function connectedPlayers(room: Room) {
  return [...room.players.values()].filter(p => p.sockets.size > 0);
}

function publicPlayers(room: Room) {
  return [...room.players.values()].map(p => ({
    userId: p.userId,
    username: p.username,
    avatarEmoji: p.avatarEmoji,
    avatarColor: p.avatarColor,
    avatarImage: p.avatarImage,
    connected: p.sockets.size > 0,
    score: p.score,
    answered: room.phase === 'question' && room.answers.has(p.userId),
  }));
}

function pauseInfo(room: Room) {
  if (!room.paused) return null;
  return { byName: room.paused.byName, ready: [...room.paused.ready], total: connectedPlayers(room).length };
}

function roomInfo(room: Room) {
  return {
    roomCode: room.code, hostId: room.hostId, solo: room.solo, phase: room.phase, settings: room.settings,
    players: publicPlayers(room), paused: pauseInfo(room), practice: room.practice?.length ?? null,
  };
}

// Ajastetut siirtymät kulkevat tämän kautta, jotta tauko voi pysäyttää ja jatkaa niitä
function schedule(room: Room, fn: () => void, ms: number) {
  clearTimeout(room.timer);
  room.scheduled = { fn, dueAt: Date.now() + ms };
  room.timer = setTimeout(() => { room.scheduled = null; fn(); }, ms);
}

function pauseGame(room: Room, byName: string) {
  if (room.paused || !['starting', 'question', 'reveal'].includes(room.phase)) return;
  clearTimeout(room.timer);
  const remainingMs = room.scheduled ? Math.max(0, room.scheduled.dueAt - Date.now()) : 0;
  room.paused = { byName, ready: new Set(), at: Date.now(), remainingMs };
  broadcastRoom(room);
}

function resumeGame(room: Room) {
  const paused = room.paused;
  if (!paused) return;
  room.paused = null;
  // Kysymyksen kello siirtyy tauon verran eteenpäin, joten vastausaikaa ei kulu tauolla
  room.questionStartedAt += Date.now() - paused.at;
  const next = room.scheduled;
  if (next) schedule(room, next.fn, paused.remainingMs);
  broadcastRoom(room);
  if (room.phase === 'question') ns?.to(room.code).emit('fq:resumed', { question: publicQuestion(room) });
}

function checkAllReady(room: Room) {
  if (room.paused && connectedPlayers(room).every(p => room.paused!.ready.has(p.userId))) resumeGame(room);
}

function broadcastRoom(room: Room) {
  ns?.to(room.code).emit('fq:room', roomInfo(room));
}

function publicQuestion(room: Room) {
  const q = room.questions[room.index];
  if (!q) return null;
  const elapsed = Date.now() - room.questionStartedAt;
  return {
    index: room.index,
    total: room.questions.length,
    kind: q.kind,
    display: q.display,
    image: room.images.flag ? `/api/flags/img/${room.images.flag}` : null,
    options: q.kind === 'choice'
      ? q.options!.map(code => ({ label: countryByCode(code).fi }))
      : q.kind === 'flagChoice'
        ? room.images.options!.map(token => ({ image: `/api/flags/img/${token}` }))
        : null,
    // "Valitse lippu" ja "totta vai tarua" näyttävät maan nimen
    name: q.kind === 'flagChoice' ? countryByCode(q.code).fi : q.kind === 'trueFalse' ? countryByCode(q.claim!).fi : null,
    timeMs: q.timeMs,
    remainingMs: Math.max(0, q.timeMs - elapsed),
  };
}

function playerSockets(room: Room, userId: number) {
  return [...(room.players.get(userId)?.sockets ?? [])];
}

// ---------- Pelin kulku ----------
function startGame(room: Room) {
  clearTimeout(room.timer);
  room.paused = null;
  room.questions = generateQuestions(room.settings.level, room.settings.count, room.settings.extras, room.settings, room.practice ?? undefined);
  room.index = -1;
  room.lastReveal = null;
  room.lastOver = null;
  // Pelin aikana poistuneet eivät jää seuraavaan peliin
  for (const p of [...room.players.values()]) if (p.sockets.size === 0) room.players.delete(p.userId);
  for (const p of room.players.values()) {
    Object.assign(p, { score: 0, correct: 0, half: 0, answered: 0, answerMs: 0, hintsLeft: room.settings.hints, results: [], usedHints: new Set(), streak: 0 });
  }
  room.phase = 'starting'; // lyhyt valmistautumistauko ennen ensimmäistä lippua
  broadcastRoom(room);
  ns?.to(room.code).emit('fq:starting', { inMs: FIRST_QUESTION_DELAY_MS, hintsLeft: room.settings.hints });
  schedule(room, () => nextQuestion(room), FIRST_QUESTION_DELAY_MS);
}

function nextQuestion(room: Room) {
  room.index += 1;
  const q = room.questions[room.index];
  if (!q) { finishGame(room); return; }
  room.phase = 'question';
  room.answers = new Map();
  room.images = {
    flag: q.kind === 'flagChoice' ? undefined : imageToken(q.code),
    options: q.kind === 'flagChoice' ? q.options!.map(imageToken) : undefined,
  };
  room.questionStartedAt = Date.now();
  for (const p of room.players.values()) p.usedHints = new Set();
  broadcastRoom(room);
  ns?.to(room.code).emit('fq:question', publicQuestion(room));
  schedule(room, () => revealQuestion(room), q.timeMs + 300);
}

function evaluate(q: Question, value: unknown): { correctness: Correctness; label: string } | null {
  if (q.kind === 'choice' || q.kind === 'flagChoice') {
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value >= q.options!.length) return null;
    const picked = q.options![value]!;
    return { correctness: picked === q.code ? 'full' : 'wrong', label: countryByCode(picked).fi };
  }
  if (q.kind === 'trueFalse') {
    if (typeof value !== 'boolean') return null;
    const truth = q.claim === q.code;
    return { correctness: value === truth ? 'full' : 'wrong', label: value ? 'Totta' : 'Tarua' };
  }
  if (typeof value !== 'string') return null;
  const text = value.trim().slice(0, 60);
  return { correctness: checkAnswer(q.code, text), label: text || '—' };
}

function submitAnswer(room: Room, userId: number, index: number, value: unknown) {
  const q = room.questions[room.index];
  const player = room.players.get(userId);
  if (room.phase !== 'question' || room.paused || index !== room.index || !q || !player || room.answers.has(userId)) return;
  const elapsedMs = Date.now() - room.questionStartedAt;
  if (elapsedMs > q.timeMs + 500) return;
  const result = evaluate(q, value);
  if (!result) return;
  const answer: Answer = { ...result, points: scoreAnswer(result.correctness, elapsedMs, q.timeMs), elapsedMs };
  room.answers.set(userId, answer);
  ns?.to(room.code).emit('fq:answered', { userId });
  // Kaikki paikalla olevat vastasivat: paljastus heti
  if (connectedPlayers(room).every(p => room.answers.has(p.userId))) {
    schedule(room, () => revealQuestion(room), room.solo ? 150 : 600);
  }
}

function revealQuestion(room: Room) {
  if (room.phase !== 'question') return;
  clearTimeout(room.timer);
  const q = room.questions[room.index]!;
  for (const p of room.players.values()) {
    const a = room.answers.get(p.userId) ?? null;
    p.results[room.index] = a;
    // Putki: kolmannesta peräkkäisestä täysin oikeasta alkaen lisäpisteitä
    p.streak = a?.correctness === 'full' ? p.streak + 1 : 0;
    if (!a) continue;
    if (p.streak >= 3) {
      a.streakBonus = Math.min((p.streak - 2) * STREAK_STEP, MAX_STREAK_BONUS);
      a.points += a.streakBonus;
    }
    a.streak = p.streak;
    p.answered += 1;
    p.score += a.points;
    if (a.correctness === 'full') { p.correct += 1; p.answerMs += a.elapsedMs; }
    if (a.correctness === 'half') p.half += 1;
  }
  room.phase = 'reveal';
  const country = countryByCode(q.code);
  room.lastReveal = {
    index: room.index,
    code: q.code,
    name: country.fi,
    image: `/api/flags/img/${imageToken(q.code)}`,
    kind: q.kind,
    correctOption: q.options ? q.options.indexOf(q.code) : null,
    truth: q.kind === 'trueFalse' ? q.claim === q.code : null,
    results: [...room.players.values()].map(p => {
      const a = room.answers.get(p.userId);
      return {
        userId: p.userId, correctness: a?.correctness ?? 'none', points: a?.points ?? 0, label: a?.label ?? null,
        streak: p.streak, streakBonus: a?.streakBonus ?? 0,
      };
    }),
  };
  broadcastRoom(room);
  ns?.to(room.code).emit('fq:reveal', room.lastReveal);
  schedule(room, () => nextQuestion(room), room.solo ? SOLO_REVEAL_MS : REVEAL_MS);
}

function factFor(room: Room) {
  // Vaikein lippu: vähiten oikeita vastauksia; tasatilanteessa se, josta on kerrottavaa
  const players = [...room.players.values()];
  const ranked = room.questions.map((q, i) => ({
    q,
    correct: players.filter(p => p.results[i]?.correctness === 'full').length,
    country: countryByCode(q.code),
  })).sort((a, b) => a.correct - b.correct || Number(!!b.country.fact) - Number(!!a.country.fact) || b.country.tier - a.country.tier);
  const hardest = ranked[0];
  if (!hardest) return null;
  const fallback = players.length > 1
    ? `${hardest.country.fi}: ${hardest.correct}/${players.length} tunnisti tämän lipun.`
    : `${hardest.country.fi} sijaitsee alueella ${hardest.country.continent}.`;
  return {
    code: hardest.q.code,
    name: hardest.country.fi,
    image: `/api/flags/img/${imageToken(hardest.q.code)}`,
    text: hardest.country.fact ?? fallback,
  };
}

async function finishGame(room: Room) {
  clearTimeout(room.timer);
  room.scheduled = null;
  room.paused = null;
  room.phase = 'over';
  const standings = [...room.players.values()]
    .sort((a, b) => b.score - a.score || b.correct - a.correct || a.answerMs - b.answerMs)
    .map((p, i, arr) => ({
      userId: p.userId,
      username: p.username,
      avatarEmoji: p.avatarEmoji,
      avatarColor: p.avatarColor,
      avatarImage: p.avatarImage,
      score: p.score,
      correct: p.correct,
      half: p.half,
      // Tasapisteillä sama sijoitus
      placement: arr.findIndex(o => o.score === p.score) + 1,
    }));
  const summary = room.questions.map((q, i) => ({
    index: i,
    code: q.code,
    name: countryByCode(q.code).fi,
    image: `/api/flags/img/${imageToken(q.code)}`,
    kind: q.kind,
    results: [...room.players.values()].map(p => ({ userId: p.userId, correctness: p.results[i]?.correctness ?? 'none', label: p.results[i]?.label ?? null })),
  }));

  // Yksinpelin ennätys: verrataan aiempaan parhaaseen ennen tallennusta
  let previousBest: number | null = null;
  const top = standings[0];
  if (room.solo && top && !room.practice) {
    try {
      const best = await pool.query(
        `SELECT MAX(fp.score)::int AS best FROM flag_game_players fp JOIN flag_games g ON g.id = fp.game_id
          WHERE fp.user_id = $1 AND g.solo AND g.level = $2 AND g.question_count = $3`,
        [top.userId, room.settings.level, room.settings.count]
      );
      previousBest = best.rows[0]?.best ?? null;
    } catch (err) { console.error('Ennätyksen haku epäonnistui:', err); }
  }

  room.lastOver = {
    standings,
    summary,
    fact: factFor(room),
    level: room.settings.level,
    levelLabel: LEVEL_LABEL[room.settings.level],
    count: room.settings.count,
    newRecord: room.solo && top && !room.practice ? previousBest === null || top.score > previousBest : false,
    previousBest,
    practice: !!room.practice,
  };
  broadcastRoom(room);
  ns?.to(room.code).emit('fq:over', room.lastOver);
  // Harjoituksia ei tallenneta tilastoihin eikä ennätyksiin
  if (!room.practice) saveGame(room, standings).catch(err => console.error('Lippuvisan tallennus epäonnistui:', err));
}

async function saveGame(room: Room, standings: { userId: number; placement: number }[]) {
  const players = [...room.players.values()];
  if (players.length === 0) return;
  const winner = standings.length > 1 && standings[0]!.placement === 1 && standings[1]!.placement !== 1 ? standings[0]!.userId : null;
  const game = await pool.query(
    'INSERT INTO flag_games (room_code, level, question_count, solo, winner_user_id) VALUES ($1, $2, $3, $4, $5) RETURNING id',
    [room.code, room.settings.level, room.settings.count, room.solo, room.solo ? null : winner]
  );
  const gameId = game.rows[0].id;
  for (const p of players) {
    const placement = standings.find(s => s.userId === p.userId)?.placement ?? players.length;
    await pool.query(
      `INSERT INTO flag_game_players (game_id, user_id, score, correct, half, answered, answer_ms, placement)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [gameId, p.userId, p.score, p.correct, p.half, p.answered, p.answerMs, placement]
    );
  }
}

function destroyRoom(room: Room) {
  clearTimeout(room.timer);
  rooms.delete(room.code);
}

function backToLobby(room: Room) {
  clearTimeout(room.timer);
  room.scheduled = null;
  room.paused = null;
  room.practice = null;
  room.phase = 'lobby';
  for (const p of [...room.players.values()]) if (p.sockets.size === 0) room.players.delete(p.userId);
  for (const p of room.players.values()) p.score = 0;
  broadcastRoom(room);
}

function ensureHost(room: Room) {
  if (room.players.get(room.hostId)?.sockets.size) return;
  const next = connectedPlayers(room)[0];
  if (next) room.hostId = next.userId;
}

async function getAvatar(userId: number) {
  const result = await pool.query('SELECT avatar_emoji, avatar_color, avatar_image FROM users WHERE id = $1', [userId]);
  const row = result.rows[0] ?? {};
  return { avatarEmoji: row.avatar_emoji ?? null, avatarColor: row.avatar_color ?? null, avatarImage: row.avatar_image ?? null };
}

async function createRoom(hostId: number, solo: boolean, level: QuizLevel, practice: string[] | null): Promise<Room> {
  let code = generateRoomCode();
  for (let i = 0; i < 20; i++) {
    const taken = rooms.has(code)
      || (await pool.query("SELECT 1 FROM games WHERE room_code = $1 AND status <> 'finished'", [code])).rowCount;
    if (!taken) break;
    code = generateRoomCode();
  }
  const room: Room = {
    code, hostId, solo, settings: defaultSettings(level), phase: 'lobby', players: new Map(), questions: [], index: -1,
    questionStartedAt: 0, images: {}, answers: new Map(), chat: [], lastReveal: null, lastOver: null, emptySince: Date.now(),
    scheduled: null, paused: null, practice,
  };
  if (practice) room.settings.count = practice.length;
  rooms.set(code, room);
  return room;
}

// ---------- Yhteydet ----------
const EVENT_BURST = 30;
const EVENTS_PER_SECOND = 15;

export function attachFlagQuiz(namespace: Namespace, authenticate: (socket: AuthedSocket, next: (err?: Error) => void) => void) {
  ns = namespace;
  namespace.use(authenticate);

  addRoomResolvers({
    name: 'Lippuvisa',
    path: (roomCode) => `/lippu/${roomCode}`,
    inGame: (userId) => [...rooms.values()].some(r =>
      (r.phase === 'starting' || r.phase === 'question' || r.phase === 'reveal') && !!r.players.get(userId)?.sockets.size),
    isInRoom: (userId, roomCode) => !!rooms.get(roomCode)?.players.has(userId),
  });

  namespace.on('connection', (socket: AuthedSocket) => {
    const userId = socket.userId!;
    let currentRoom: Room | null = null;
    let tokens = EVENT_BURST;
    let last = Date.now();
    let chatTokens = 5;
    let chatLast = Date.now();

    // Pyyntörajoitus ja virheiden eristys kuten pelihuoneissa
    const on = (event: string, handler: (data: any, ack?: (res: unknown) => void) => unknown) => {
      socket.on(event, async (data: any, ack?: (res: unknown) => void) => {
        const now = Date.now();
        tokens = Math.min(EVENT_BURST, tokens + ((now - last) / 1000) * EVENTS_PER_SECOND);
        last = now;
        if (tokens < 1) return;
        tokens -= 1;
        try {
          await handler(data ?? {}, typeof ack === 'function' ? ack : undefined);
        } catch (err) {
          console.error(`Lippuvisa ${event}:`, err);
          socket.emit('fq:error', { message: 'Palvelinvirhe' });
        }
      });
    };

    const leaveCurrent = () => {
      const room = currentRoom;
      if (!room) return;
      currentRoom = null;
      socket.leave(room.code);
      const player = room.players.get(userId);
      if (!player) return;
      player.sockets.delete(socket.id);
      if (player.sockets.size > 0) return;
      // Aulassa poistuva lähtee kokonaan; pelin aikana tulos säilyy ja paluu on mahdollinen
      if (room.phase === 'lobby') room.players.delete(userId);
      if (connectedPlayers(room).length === 0) room.emptySince = Date.now();
      ensureHost(room);
      broadcastRoom(room);
      checkAllReady(room);
      // Jos poistuja oli ainoa, jota odotettiin, paljastetaan heti
      if (room.phase === 'question' && !room.paused && connectedPlayers(room).length > 0
        && connectedPlayers(room).every(p => room.answers.has(p.userId))) {
        schedule(room, () => revealQuestion(room), 300);
      }
    };

    on('fq:create', async ({ solo, level, practice }, ack) => {
      // Harjoitus virheistä: vain tunnettuja lippuja, ilman tuplia
      const codes = Array.isArray(practice)
        ? [...new Set(practice.filter((c: unknown) => typeof c === 'string' && VALID_CODES.has(c)))].slice(0, MAX_PRACTICE) as string[]
        : null;
      const room = await createRoom(userId, !!solo || !!codes?.length, LEVELS.includes(level) ? level : 'tourist', codes?.length ? codes : null);
      ack?.({ roomCode: room.code });
    });

    on('fq:join', async ({ roomCode }) => {
      const code = parseRoomCode(roomCode);
      const room = code ? rooms.get(code) : undefined;
      if (!room) { socket.emit('fq:joinRejected', { message: 'Huonetta ei löytynyt. Peli on voinut päättyä, tai palvelin päivitettiin kesken pelin.' }); return; }
      const existing = room.players.get(userId);
      if (!existing) {
        if (room.solo && userId !== room.hostId) { socket.emit('fq:joinRejected', { message: 'Tämä on toisen pelaajan yksinpeli' }); return; }
        if (room.phase !== 'lobby' && room.phase !== 'over') { socket.emit('fq:joinRejected', { message: 'Peli on jo käynnissä — odota että se päättyy' }); return; }
        if (room.players.size >= MAX_PLAYERS) { socket.emit('fq:joinRejected', { message: 'Huone on täynnä' }); return; }
      }
      if (currentRoom && currentRoom !== room) leaveCurrent();
      currentRoom = room;
      socket.join(room.code);
      const avatar = await getAvatar(userId);
      if (existing) {
        existing.sockets.add(socket.id);
        Object.assign(existing, avatar, { username: socket.username! });
      } else {
        room.players.set(userId, {
          userId, username: socket.username!, ...avatar, sockets: new Set([socket.id]), score: 0, correct: 0, half: 0,
          answered: 0, answerMs: 0, hintsLeft: room.settings.hints, results: [], usedHints: new Set(), streak: 0,
        });
      }
      room.emptySince = null;
      ensureHost(room);
      const me = room.players.get(userId)!;
      socket.emit('fq:state', {
        ...roomInfo(room),
        question: room.phase === 'question' ? publicQuestion(room) : null,
        myAnswered: room.answers.has(userId),
        hintsLeft: me.hintsLeft,
        reveal: room.phase === 'reveal' ? room.lastReveal : null,
        over: room.phase === 'over' ? room.lastOver : null,
        chat: room.chat,
      });
      socket.to(room.code).emit('fq:room', roomInfo(room));
    });

    on('fq:leave', () => leaveCurrent());

    on('fq:settings', ({ settings }) => {
      const room = currentRoom;
      if (!room || room.hostId !== userId || room.phase !== 'lobby') return;
      room.settings = sanitizeSettings(settings, room.settings);
      broadcastRoom(room);
    });

    on('fq:start', ({ settings }) => {
      const room = currentRoom;
      if (!room || room.hostId !== userId || (room.phase !== 'lobby' && room.phase !== 'over')) return;
      if (settings) room.settings = sanitizeSettings(settings, room.settings);
      startGame(room);
    });

    // Tauko: kuka tahansa voi pysäyttää; peli jatkuu, kun kaikki paikalla olevat ovat valmiita
    on('fq:pause', () => {
      const room = currentRoom;
      const player = room?.players.get(userId);
      if (!room || !player) return;
      pauseGame(room, player.username);
    });

    on('fq:ready', ({ ready }) => {
      const room = currentRoom;
      if (!room?.paused || !room.players.has(userId)) return;
      if (ready === false) room.paused.ready.delete(userId);
      else room.paused.ready.add(userId);
      broadcastRoom(room);
      checkAllReady(room);
    });

    on('fq:toLobby', () => {
      const room = currentRoom;
      if (!room || room.hostId !== userId || room.phase !== 'over') return;
      backToLobby(room);
    });

    on('fq:answer', ({ index, value }) => {
      if (currentRoom) submitAnswer(currentRoom, userId, index, value);
    });

    on('fq:hint', ({ index, type }) => {
      const room = currentRoom;
      const player = room?.players.get(userId);
      const q = room?.questions[room.index];
      if (!room || !player || !q || room.phase !== 'question' || room.paused || index !== room.index || room.answers.has(userId)) return;
      if (player.hintsLeft <= 0 || player.usedHints.has(type)) return;
      let payload: Record<string, unknown> | null = null;
      if (type === 'letters' && q.kind === 'write') payload = { letters: letterHint(q.code) };
      if (type === 'fifty' && (q.kind === 'choice' || q.kind === 'flagChoice')) {
        payload = { removed: fiftyFiftyHint(q).map(code => q.options!.indexOf(code)) };
      }
      if (!payload) return;
      player.hintsLeft -= 1;
      player.usedHints.add(type);
      for (const id of playerSockets(room, userId)) namespace.to(id).emit('fq:hint', { index, type, hintsLeft: player.hintsLeft, ...payload });
    });

    on('chat:send', ({ text, emote }) => {
      const room = currentRoom;
      const player = room?.players.get(userId);
      if (!room || !player) return;
      const now = Date.now();
      chatTokens = Math.min(5, chatTokens + (now - chatLast) / 1500);
      chatLast = now;
      if (chatTokens < 1) { socket.emit('chat:slowdown'); return; }
      const isEmote = typeof emote === 'string' && EMOTES.has(emote);
      const content = isEmote ? emote as string : cleanChatText(text);
      if (!content) return;
      chatTokens -= 1;
      const message: ChatMessage = { id: nextChatId(), userId, username: player.username, text: content, emote: isEmote, at: now };
      room.chat.push(message);
      if (room.chat.length > CHAT_HISTORY) room.chat.splice(0, room.chat.length - CHAT_HISTORY);
      namespace.to(room.code).emit('chat:message', message);
    });

    socket.on('disconnect', () => leaveCurrent());
  });
}

// ---------- Ennätykset ja tilastot ----------
export async function getRecords(userId: number, level: QuizLevel, count: number) {
  const result = await pool.query(
    `WITH people AS (
       SELECT $1::int AS id
       UNION
       SELECT CASE WHEN requester_id = $1 THEN addressee_id ELSE requester_id END
         FROM friendships WHERE status = 'accepted' AND (requester_id = $1 OR addressee_id = $1)
     )
     SELECT u.id, u.username, u.avatar_emoji, u.avatar_color, u.avatar_image, MAX(fp.score)::int AS best
       FROM people
       JOIN users u ON u.id = people.id
       JOIN flag_game_players fp ON fp.user_id = u.id
       JOIN flag_games g ON g.id = fp.game_id AND g.solo AND g.level = $2 AND g.question_count = $3
      GROUP BY u.id
      ORDER BY best DESC
      LIMIT 20`,
    [userId, level, count]
  );
  return result.rows.map(r => ({
    userId: r.id, username: r.username, avatarEmoji: r.avatar_emoji, avatarColor: r.avatar_color, avatarImage: r.avatar_image,
    best: r.best, isMe: r.id === userId,
  }));
}

export function parseLevel(value: unknown): QuizLevel | null {
  return LEVELS.includes(value as QuizLevel) ? value as QuizLevel : null;
}
