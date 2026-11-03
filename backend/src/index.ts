import express from 'express';
import { createServer } from 'http';
import { Server, Socket } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';
import path from 'path';
import fs from 'fs';
import { pool } from './db/pool';
import { clampNumber, parseRoomCode } from './utils/validation';
import authRoutes from './routes/auth';
import gameRoutes from './routes/games';
import profileRoutes from './routes/profile';
import {
  getGameIdByRoomCode, getLatestGameByRoomCode, getUserAvatar, markGameStarted, saveRound, finalizeGame, createGameRow,
} from './db/gameQueries';

dotenv.config();

if (!process.env.JWT_SECRET || !process.env.DATABASE_URL) {
  console.error('JWT_SECRET ja DATABASE_URL pitää asettaa ympäristömuuttujiin');
  process.exit(1);
}

const isProduction = process.env.NODE_ENV === 'production';

const app = express();
// Render (ja muut palvelut) välittävät pyynnöt proxyn kautta — oikea IP pyyntörajoitusta varten
app.set('trust proxy', 1);
app.use(cors());
// Perustason tietoturvaotsakkeet: ei upotusta muiden sivuille, ei MIME-arvailua, ei viittaajan vuotamista
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  if (isProduction) res.setHeader('Strict-Transport-Security', 'max-age=31536000');
  next();
});
app.disable('x-powered-by');
app.use(express.json({ limit: '300kb' })); // profiilikuva mahtuu mukaan
// Kehityksen testisivu (public/test.html) vain paikallisesti, ei julkisessa versiossa
if (!isProduction) app.use(express.static('public'));

app.use('/api/games', gameRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/profile', profileRoutes);

const httpServer = createServer(app);
const io = new Server(httpServer, { cors: { origin: '*' } });

// Virheellinen JSON tai liian suuri pyyntö: selkeä vastaus ilman palvelimen sisäisiä tietoja
app.use((err: any, _req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (err?.type === 'entity.too.large') return res.status(413).json({ error: 'Pyyntö on liian suuri' });
  if (err?.type === 'entity.parse.failed') return res.status(400).json({ error: 'Virheellinen pyyntö' });
  next(err);
});

app.get('/api/health', async (req, res) => {
  try {
    const result = await pool.query('SELECT NOW()');
    res.json({ status: 'ok', dbTime: result.rows[0].now });
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: 'error', message: 'Database connection failed' });
  }
});

// Tuotannossa backend tarjoilee myös frontendin buildin, jolloin koko peli toimii yhdestä osoitteesta
const frontendDist = path.join(__dirname, '../../frontend/dist');
if (fs.existsSync(frontendDist)) {
  // Hashatut tiedostot (assets/) voi välimuistittaa pitkään; index.html haetaan aina tuoreena
  app.use(express.static(frontendDist, {
    index: false,
    setHeaders: (res, filePath) => {
      if (filePath.includes(`${path.sep}assets${path.sep}`)) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    },
  }));
  const indexHtml = fs.readFileSync(path.join(frontendDist, 'index.html'), 'utf8');
  app.get(/^\/(?!api\/|socket\.io\/).*/, (req, res) => {
    // Linkin esikatselukuva tarvitsee täydellisen osoitteen
    const origin = `${req.protocol}://${req.get('host')}`;
    res.setHeader('Cache-Control', 'no-cache');
    res.type('html').send(indexHtml.split('__ORIGIN__').join(origin));
  });
}

interface AuthenticatedSocket extends Socket {
  userId?: number;
  username?: string;
}

io.use((socket: AuthenticatedSocket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) return next(new Error('Token puuttuu'));
  jwt.verify(token, process.env.JWT_SECRET!, (err: any, payload: any) => {
    if (err) return next(new Error('Virheellinen token'));
    socket.userId = payload.userId;
    socket.username = payload.username;
    next();
  });
});

interface RoomPlayer {
  socketId: string;
  userId: number;
  username: string;
  isHost: boolean;
  wasHost: boolean;
  isConnected: boolean;
  isBot: boolean;
  avatarEmoji?: string | null;
  avatarColor?: string | null;
  avatarImage?: string | null;
}

interface SymbolStat { count: number; wins: number; losses: number; draws: number; }

const RECONNECT_GRACE_MS = 60 * 1000;
const PAUSE_GRACE_MS = 5 * 1000;
const ALL_PICKED_COUNTDOWN_MS = 3 * 1000;
const STARTING_HEARTS = 3;

const roomPlayers: Record<string, RoomPlayer[]> = {};
const roundTimers: Record<string, NodeJS.Timeout> = {};
const nextRoundTimers: Record<string, NodeJS.Timeout> = {};
const disconnectTimers: Record<string, Record<number, NodeJS.Timeout>> = {};
const pauseGraceTimers: Record<string, Record<number, NodeJS.Timeout>> = {};
const roundPicks: Record<string, Record<number, string>> = {};
const currentRound: Record<string, number> = {};
const lastCompletedRound: Record<string, number> = {};
const gameWins: Record<string, Record<number, number>> = {};
const winsRequired: Record<string, number> = {};
const gameMode: Record<string, 'classic' | 'extended'> = {};
const gameIdByRoom: Record<string, number> = {};
const symbolStatsByRoom: Record<string, Record<number, Record<string, SymbolStat>>> = {};
const gameStarted: Record<string, boolean> = {};
const roundPaused: Record<string, boolean> = {};
const pendingNextRoundNumber: Record<string, number> = {};
const heartsByRoom: Record<string, Record<number, number>> = {};
const dnfByRoom: Record<string, Set<number>> = {};

const gameSpeed: Record<string, 'fast' | 'relaxed'> = {};
const roundGapSeconds: Record<string, number> = {};
const firstRoundDuration: Record<string, number> = {};
const readyPlayers: Record<string, Set<number>> = {};
const awaitingReady: Record<string, boolean> = {};

const roundTimerEndAt: Record<string, number> = {};
const spedUp: Record<string, boolean> = {};

const laterRoundDuration: Record<string, number> = {};

// Tallessa jotta uudelleen liittyvälle (esim. sivun päivitys) voidaan lähettää koko pelin tila
type ReadyReason = 'game-start' | 'round-gap' | 'manual-pause';
interface RevealResult { username: string; symbol: string | null; dnf: boolean; }
const readyReasonByRoom: Record<string, ReadyReason> = {};
const pausedByNameByRoom: Record<string, string> = {};
const lastRevealByRoom: Record<string, { results: RevealResult[]; winners: string[]; isDraw: boolean }> = {};
const gameOverWinnerByRoom: Record<string, string | null> = {};
const roomCreatorByRoom: Record<string, number> = {};

const MAX_PLAYERS = 4;

// Lisätyt botit saavat negatiivisen id:n, jolla ne erottaa oikeista käyttäjistä
const BOT_NAMES = ['Robo-Kalle', 'Bitti-Liisa', 'Sirpa-3000', 'Turbo-Teppo'];
let nextBotUserId = -1;

// Hostin valitsemat asetukset ennen pelin alkua — näytetään myös muille pelaajille
interface LobbySettings {
  mode: 'classic' | 'extended';
  winsRequired: number;
  speed: 'fast' | 'relaxed';
  firstRoundSeconds: number;
  laterRoundSeconds: number;
  roundGap: number;
}
const lobbySettingsByRoom: Record<string, LobbySettings> = {};

function sanitizeSettings(input: unknown): LobbySettings {
  const s = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  return {
    mode: s.mode === 'extended' ? 'extended' : 'classic',
    winsRequired: clampWinsRequired(s.winsRequired),
    speed: s.speed === 'relaxed' ? 'relaxed' : 'fast',
    firstRoundSeconds: clampNumber(s.firstRoundSeconds, 5, 20, 15),
    laterRoundSeconds: clampNumber(s.laterRoundSeconds, 3, 15, 8),
    roundGap: clampNumber(s.roundGap, 2, 10, 5),
  };
}

function clampWinsRequired(value: unknown): number {
  return clampNumber(value, 1, 10, 3);
}

// Palauttaa syyn miksi käyttäjä ei voi liittyä huoneeseen, null jos voi,
// tai undefined jos huone ei ole muistissa (silloin päätös tehdään tietokannan perusteella)
function getRoomJoinError(roomCode: string, userId: number): string | null | undefined {
  const players = roomPlayers[roomCode];
  if (!players) return undefined;
  if (players.some(p => p.userId === userId)) return null;
  if (gameStarted[roomCode]) return 'Peli on jo käynnissä — odota että se päättyy';
  if (players.length >= MAX_PLAYERS) return 'Huone on täynnä';
  return null;
}
app.locals.getRoomJoinError = getRoomJoinError;

function getRoundDuration(roomCode: string, roundNumber: number): number {
  if (roundNumber === 1) return firstRoundDuration[roomCode] || 15;
  return laterRoundDuration[roomCode] || 8;
}

const SYMBOLS_CLASSIC = ['rock', 'paper', 'scissors'];
const SYMBOLS_EXTENDED = ['rock', 'paper', 'scissors', 'lizard', 'spock'];

function getRandomSymbol(mode: 'classic' | 'extended'): string {
  const symbols = mode === 'extended' ? SYMBOLS_EXTENDED : SYMBOLS_CLASSIC;
  return symbols[Math.floor(Math.random() * symbols.length)]!;
}

const BEATS_CLASSIC: Record<string, string[]> = { rock: ['scissors'], paper: ['rock'], scissors: ['paper'] };
const BEATS_EXTENDED: Record<string, string[]> = {
  rock: ['scissors', 'lizard'], paper: ['rock', 'spock'], scissors: ['paper', 'lizard'],
  lizard: ['spock', 'paper'], spock: ['scissors', 'rock'],
};

function determineWinners(
  results: { username: string; userId: number; symbol: string | null }[],
  mode: 'classic' | 'extended'
): { winnerUserIds: number[]; isDraw: boolean } {
  const beats = mode === 'extended' ? BEATS_EXTENDED : BEATS_CLASSIC;
  const validResults = results.filter(r => r.symbol !== null);
  if (validResults.length === 0) return { winnerUserIds: [], isDraw: true };

  const symbolsPresent = Array.from(new Set(validResults.map(r => r.symbol as string)));
  if (symbolsPresent.length <= 1) {
    return { winnerUserIds: validResults.map(r => r.userId), isDraw: validResults.length > 1 };
  }

  const survivors = symbolsPresent.filter(s => !symbolsPresent.some(t => t !== s && beats[t]?.includes(s)));
  if (survivors.length === 1) {
    const winningSymbol = survivors[0];
    return { winnerUserIds: validResults.filter(r => r.symbol === winningSymbol).map(r => r.userId), isDraw: false };
  }
  return { winnerUserIds: validResults.map(r => r.userId), isDraw: true };
}

function recordSymbolStat(roomCode: string, userId: number, symbol: string, outcome: 'win' | 'loss' | 'draw') {
  if (!symbolStatsByRoom[roomCode]) symbolStatsByRoom[roomCode] = {};
  if (!symbolStatsByRoom[roomCode]![userId]) symbolStatsByRoom[roomCode]![userId] = {};
  if (!symbolStatsByRoom[roomCode]![userId]![symbol]) {
    symbolStatsByRoom[roomCode]![userId]![symbol] = { count: 0, wins: 0, losses: 0, draws: 0 };
  }
  const stat = symbolStatsByRoom[roomCode]![userId]![symbol]!;
  stat.count += 1;
  if (outcome === 'win') stat.wins += 1;
  else if (outcome === 'loss') stat.losses += 1;
  else stat.draws += 1;
}

function hasConnectedPlayers(roomCode: string): boolean {
  return (roomPlayers[roomCode] || []).some(p => p.isConnected);
}
function anyPlayerWaiting(roomCode: string): boolean {
  return (roomPlayers[roomCode] || []).some(p => !p.isConnected && !p.isBot);
}
function broadcastPauseState(roomCode: string) {
  const players = roomPlayers[roomCode] || [];
  const waitingNames = players.filter(p => !p.isConnected && !p.isBot).map(p => p.username);
  io.to(roomCode).emit('game:pause', { paused: waitingNames.length > 0, waitingFor: waitingNames });
}

function heartsSnapshot(roomCode: string) {
  const players = roomPlayers[roomCode] || [];
  return players.map(p => ({ username: p.username, hearts: heartsByRoom[roomCode]?.[p.userId] ?? STARTING_HEARTS }));
}

function cleanupRoom(roomCode: string) {
  clearTimeout(roundTimers[roomCode]);
  clearTimeout(nextRoundTimers[roomCode]);
  if (disconnectTimers[roomCode]) Object.values(disconnectTimers[roomCode]).forEach(t => clearTimeout(t));
  if (pauseGraceTimers[roomCode]) Object.values(pauseGraceTimers[roomCode]).forEach(t => clearTimeout(t));
  delete pauseGraceTimers[roomCode];
  delete roomPlayers[roomCode]; delete roundTimers[roomCode]; delete nextRoundTimers[roomCode];
  delete disconnectTimers[roomCode]; delete roundPicks[roomCode]; delete currentRound[roomCode];
  delete lastCompletedRound[roomCode];
  delete gameWins[roomCode]; delete winsRequired[roomCode]; delete gameMode[roomCode];
  delete gameIdByRoom[roomCode]; delete symbolStatsByRoom[roomCode]; delete gameStarted[roomCode];
  delete roundPaused[roomCode]; delete pendingNextRoundNumber[roomCode];
  delete heartsByRoom[roomCode]; delete dnfByRoom[roomCode];
  delete gameSpeed[roomCode]; delete roundGapSeconds[roomCode]; delete firstRoundDuration[roomCode]; delete laterRoundDuration[roomCode];
  delete readyPlayers[roomCode]; delete awaitingReady[roomCode];
  delete roundTimerEndAt[roomCode]; delete spedUp[roomCode];
  delete readyReasonByRoom[roomCode]; delete pausedByNameByRoom[roomCode];
  delete lastRevealByRoom[roomCode]; delete gameOverWinnerByRoom[roomCode]; delete roomCreatorByRoom[roomCode];
  delete lobbySettingsByRoom[roomCode];
  clearBotPicks(roomCode);
  console.log(`Huone ${roomCode}: siivottu kokonaan`);
}

// Botit valitsevat ihmismäisellä viiveellä: yleensä muutamassa sekunnissa, joskus vasta loppuhetkillä
const botPickTimers: Record<string, NodeJS.Timeout[]> = {};

function clearBotPicks(roomCode: string) {
  botPickTimers[roomCode]?.forEach(t => clearTimeout(t));
  delete botPickTimers[roomCode];
}

function scheduleBotPicks(roomCode: string, roundNumber: number, durationMs: number) {
  clearBotPicks(roomCode);
  const dnfSet = dnfByRoom[roomCode] || new Set();
  const mode = gameMode[roomCode] || 'classic';
  botPickTimers[roomCode] = (roomPlayers[roomCode] || [])
    .filter(p => p.isBot && !dnfSet.has(p.userId))
    .map(p => {
      const quick = Math.random() < 0.75;
      const delay = quick ? 900 + Math.random() * 2600 : durationMs * (0.45 + Math.random() * 0.4);
      return setTimeout(() => {
        if (currentRound[roomCode] !== roundNumber) return;
        submitPick(roomCode, p.userId, getRandomSymbol(mode));
      }, Math.min(delay, Math.max(durationMs - 700, 300)));
    });
}

function pauseRound(roomCode: string) {
  if (roundPaused[roomCode]) return;
  if (!roundTimers[roomCode]) return;
  roundPaused[roomCode] = true;
  clearTimeout(roundTimers[roomCode]);
  delete roundTimers[roomCode];
}

function submitPick(roomCode: string, userId: number, symbol: string) {
  const roundNumber = currentRound[roomCode];
  if (!roundNumber || roundNumber === -1) return;
  // Vain huoneen pelaajat, ja vain pelimuodon sallimat kädet
  if (!roomPlayers[roomCode]?.some(p => p.userId === userId)) return;
  const allowed = gameMode[roomCode] === 'extended' ? SYMBOLS_EXTENDED : SYMBOLS_CLASSIC;
  if (!allowed.includes(symbol)) return;
  if (roundPaused[roomCode]) return;
  if (dnfByRoom[roomCode]?.has(userId)) return;

  if (!roundPicks[roomCode]) roundPicks[roomCode] = {};
  if (roundPicks[roomCode]![userId] !== undefined) return;
  roundPicks[roomCode]![userId] = symbol;

  checkAllPicked(roomCode, roundNumber);
}

function checkAllPicked(roomCode: string, roundNumber: number) {
  const players = roomPlayers[roomCode] || [];
  const dnfSet = dnfByRoom[roomCode] || new Set();
  const required = players.filter(p => !dnfSet.has(p.userId));
  const pickedUserIds = Object.keys(roundPicks[roomCode] || {}).map(Number);
  const pickedNames = players.filter(p => pickedUserIds.includes(p.userId)).map(p => p.username);

  io.to(roomCode).emit('pick:count', { picked: pickedUserIds.length, total: required.length, pickedNames });

  if (pickedUserIds.length >= required.length && required.length > 0 && !spedUp[roomCode] && roundTimers[roomCode]) {
    spedUp[roomCode] = true;
    const remainingMs = Math.max((roundTimerEndAt[roomCode] || Date.now()) - Date.now(), 300);
    // Kun kaikki ovat valinneet, ei odotella turhaan: ajastin hyppää 3 sekuntiin (3–2–1 ja paljastus)
    const newRemainingMs = Math.min(remainingMs, ALL_PICKED_COUNTDOWN_MS);
    clearTimeout(roundTimers[roomCode]);
    roundTimerEndAt[roomCode] = Date.now() + newRemainingMs;
    roundTimers[roomCode] = setTimeout(() => handleTimeout(roomCode, roundNumber), newRemainingMs);
    io.to(roomCode).emit('round:speedup', {
      remainingSeconds: Math.max(Math.ceil(newRemainingMs / 1000), 1),
      newDuration: newRemainingMs / 1000,
    });
  }
}

function startReadyCheck(roomCode: string, reason: ReadyReason) {
  awaitingReady[roomCode] = true;
  readyReasonByRoom[roomCode] = reason;
  readyPlayers[roomCode] = new Set();
  if (reason !== 'manual-pause') delete pausedByNameByRoom[roomCode];
  if (reason === 'game-start') {
    delete lastRevealByRoom[roomCode];
    delete gameOverWinnerByRoom[roomCode];
  }

  const players = roomPlayers[roomCode] || [];
  players.forEach(p => {
    if (p.isBot) readyPlayers[roomCode]!.add(p.userId);
  });

  const readyNames = players.filter(p => readyPlayers[roomCode]!.has(p.userId)).map(p => p.username);
  io.to(roomCode).emit('ready:check', {
    reason, readyNames, total: players.length, mode: gameMode[roomCode] || 'classic', winsRequired: winsRequired[roomCode] || 3,
  });

  checkAllReady(roomCode);
}

function checkAllReady(roomCode: string) {
  if (!awaitingReady[roomCode]) return;
  const players = roomPlayers[roomCode] || [];
  const connectedOrBot = players.filter(p => p.isConnected || p.isBot);

  if (connectedOrBot.length > 0 && connectedOrBot.every(p => readyPlayers[roomCode]?.has(p.userId))) {
    awaitingReady[roomCode] = false;
    delete pausedByNameByRoom[roomCode];
    io.to(roomCode).emit('ready:allReady');

    const nextRound = (lastCompletedRound[roomCode] || 0) + 1;
    // Tauolla keskeytetty kierros jatkuu samana kierroksena (sydämet ja sivussa olijat säilyvät)
    const isResume = !!roundPaused[roomCode] && currentRound[roomCode] === nextRound;
    setTimeout(() => startRound(roomCode, nextRound, isResume), 800);
  }
}

function startRound(roomCode: string, roundNumber: number, isRetry: boolean = false) {
  const duration = getRoundDuration(roomCode, roundNumber);

  currentRound[roomCode] = roundNumber;
  roundPicks[roomCode] = {};
  roundPaused[roomCode] = false;
  spedUp[roomCode] = false;
  roundTimerEndAt[roomCode] = Date.now() + duration * 1000;

  if (!isRetry) {
    dnfByRoom[roomCode] = new Set();
  }

  const dnfSet = dnfByRoom[roomCode] || new Set();
  const dnfNames = (roomPlayers[roomCode] || []).filter(p => dnfSet.has(p.userId)).map(p => p.username);

  io.to(roomCode).emit('round:start', {
    roundNumber, duration, mode: gameMode[roomCode], dnf: dnfNames, hearts: heartsSnapshot(roomCode),
  });
  console.log(`Huone ${roomCode}: kierros ${roundNumber} alkoi, ${duration}s`);

  scheduleBotPicks(roomCode, roundNumber, duration * 1000);

  roundTimers[roomCode] = setTimeout(() => {
    handleTimeout(roomCode, roundNumber);
  }, duration * 1000);
}

function handleTimeout(roomCode: string, roundNumber: number) {
  if (currentRound[roomCode] !== roundNumber) return;

  const players = roomPlayers[roomCode] || [];
  const dnfSet = dnfByRoom[roomCode] || (dnfByRoom[roomCode] = new Set());
  // Varmuuden vuoksi: botti joka ei jostain syystä ehtinyt valita, valitsee nyt
  clearBotPicks(roomCode);
  players.filter(p => p.isBot && !dnfSet.has(p.userId) && roundPicks[roomCode]?.[p.userId] === undefined).forEach(p => {
    if (!roundPicks[roomCode]) roundPicks[roomCode] = {};
    roundPicks[roomCode]![p.userId] = getRandomSymbol(gameMode[roomCode] || 'classic');
  });
  const missing = players.filter(p => !p.isBot && !dnfSet.has(p.userId) && roundPicks[roomCode]?.[p.userId] === undefined);

  if (missing.length === 0) {
    resolveRound(roomCode, roundNumber);
    return;
  }

  if (!heartsByRoom[roomCode]) heartsByRoom[roomCode] = {};
  const mode = gameMode[roomCode] || 'classic';

  // Kerrotaan kaikille kuka ei ehtinyt valita (ja menetti sydämen)
  io.to(roomCode).emit('round:missed', {
    names: missing.map(p => p.username),
    retry: players.length === 2,
  });

  if (players.length === 2) {
    let restarted = false;
    const autoLosers: number[] = [];

    for (const p of missing) {
      const hearts = heartsByRoom[roomCode]![p.userId] ?? STARTING_HEARTS;
      if (hearts > 0) {
        heartsByRoom[roomCode]![p.userId] = hearts - 1;
        restarted = true;
      } else {
        autoLosers.push(p.userId);
      }
    }

    if (restarted) {
      io.to(roomCode).emit('round:retry', { reason: 'missed-pick' });
      startRound(roomCode, roundNumber, true);
      return;
    }

    if (autoLosers.length === 1) {
      finalizeForcedLoss(roomCode, roundNumber, autoLosers[0]!);
    } else {
      finalizeDraw(roomCode, roundNumber);
    }
    return;
  }

  for (const p of missing) {
    const hearts = heartsByRoom[roomCode]![p.userId] ?? STARTING_HEARTS;
    if (hearts > 0) {
      heartsByRoom[roomCode]![p.userId] = hearts - 1;
      roundPicks[roomCode]![p.userId] = getRandomSymbol(mode);
    } else {
      dnfSet.add(p.userId);
    }
  }
  // Jos kaikilta loppuivat sydämet yhtä aikaa, kierros päättyy tasapeliin eikä jää jumiin
  if (players.every(p => dnfSet.has(p.userId))) {
    finalizeDraw(roomCode, roundNumber);
    return;
  }
  checkAllPicked(roomCode, roundNumber);
}

function resolveRound(roomCode: string, roundNumber: number) {
  if (currentRound[roomCode] !== roundNumber) return;

  const players = roomPlayers[roomCode] || [];
  const dnfSet = dnfByRoom[roomCode] || new Set();
  const activePlayers = players.filter(p => !dnfSet.has(p.userId));
  const stillMissing = activePlayers.filter(p => roundPicks[roomCode]?.[p.userId] === undefined);
  if (stillMissing.length > 0) return;

  clearTimeout(roundTimers[roomCode]);
  const mode = gameMode[roomCode] || 'classic';
  const activeResults = activePlayers.map(p => ({ username: p.username, userId: p.userId, symbol: roundPicks[roomCode]![p.userId]! }));
  const { winnerUserIds, isDraw } = determineWinners(activeResults, mode);

  if (isDraw && activePlayers.length > 1) {
    io.to(roomCode).emit('round:retry', { reason: 'draw' });
    roundPicks[roomCode] = {};
    spedUp[roomCode] = false;
    const duration = getRoundDuration(roomCode, roundNumber);
    scheduleBotPicks(roomCode, roundNumber, duration * 1000);
    roundTimerEndAt[roomCode] = Date.now() + duration * 1000;
    io.to(roomCode).emit('round:start', {
      roundNumber, duration, mode,
      dnf: (roomPlayers[roomCode] || []).filter(p => dnfSet.has(p.userId)).map(p => p.username),
      hearts: heartsSnapshot(roomCode),
    });
    roundTimers[roomCode] = setTimeout(() => handleTimeout(roomCode, roundNumber), duration * 1000);
    return;
  }

  finalizeRound(roomCode, roundNumber, players, winnerUserIds, isDraw, dnfSet);
}

function finalizeForcedLoss(roomCode: string, roundNumber: number, loserUserId: number) {
  const players = roomPlayers[roomCode] || [];
  const winner = players.find(p => p.userId !== loserUserId);
  finalizeRound(roomCode, roundNumber, players, winner ? [winner.userId] : [], false, new Set());
}

function finalizeDraw(roomCode: string, roundNumber: number) {
  const players = roomPlayers[roomCode] || [];
  finalizeRound(roomCode, roundNumber, players, [], true, new Set());
}

async function finalizeRound(
  roomCode: string,
  roundNumber: number,
  players: RoomPlayer[],
  winnerUserIds: number[],
  isDraw: boolean,
  dnfSet: Set<number>
) {
  clearTimeout(roundTimers[roomCode]);

  const mode = gameMode[roomCode] || 'classic';
  if (!gameWins[roomCode]) gameWins[roomCode] = {};
  if (!isDraw) {
    winnerUserIds.forEach(id => { gameWins[roomCode]![id] = (gameWins[roomCode]![id] || 0) + 1; });
  }

  const resultsOut = players.map(p => ({
    username: p.username,
    symbol: dnfSet.has(p.userId) ? null : (roundPicks[roomCode]?.[p.userId] ?? null),
    dnf: dnfSet.has(p.userId),
  }));

  for (const p of players) {
    if (dnfSet.has(p.userId)) continue;
    const symbol = roundPicks[roomCode]?.[p.userId];
    if (!symbol) continue;
    const outcome: 'win' | 'loss' | 'draw' = isDraw ? 'draw' : winnerUserIds.includes(p.userId) ? 'win' : 'loss';
    recordSymbolStat(roomCode, p.userId, symbol, outcome);
  }

  const winsSnapshot = players.map(p => ({ username: p.username, wins: gameWins[roomCode]?.[p.userId] || 0 }));
  const winnerNames = players.filter(p => winnerUserIds.includes(p.userId)).map(p => p.username);

  io.to(roomCode).emit('round:reveal', {
    roundNumber, results: resultsOut, winners: winnerNames, isDraw, wins: winsSnapshot, hearts: heartsSnapshot(roomCode),
  });
  lastRevealByRoom[roomCode] = { results: resultsOut, winners: winnerNames, isDraw };
  console.log(`Huone ${roomCode}: kierros ${roundNumber} paljastettu, voittajat: ${winnerNames.join(', ') || 'ei ketään'}`);

  currentRound[roomCode] = -1;
  lastCompletedRound[roomCode] = roundNumber;

  const gameId = gameIdByRoom[roomCode];
  if (gameId) {
    try {
      await saveRound(gameId, roundNumber, players.map(p => ({
        userId: p.userId,
        symbol: dnfSet.has(p.userId) ? null : (roundPicks[roomCode]?.[p.userId] ?? null),
        isBot: p.isBot,
      })));
    } catch (err) { console.error('Kierroksen tallennus epäonnistui:', err); }
  }

  if (!hasConnectedPlayers(roomCode)) return;

  const required = winsRequired[roomCode] || 3;
  const gameWinnerEntry = Object.entries(gameWins[roomCode] || {}).find(([_, wins]) => wins >= required);

  if (gameWinnerEntry) {
    const winnerId = parseInt(gameWinnerEntry[0]);
    const gameWinner = players.find(p => p.userId === winnerId);
    io.to(roomCode).emit('game:over', { winner: gameWinner?.username || null, finalWins: winsSnapshot });
    gameOverWinnerByRoom[roomCode] = gameWinner?.username || null;

    if (gameId) {
      try {
        const playerWins = players.map(p => ({ userId: p.userId, wins: gameWins[roomCode]?.[p.userId] || 0 }));
        await finalizeGame(gameId, mode, playerWins, symbolStatsByRoom[roomCode] || {}, winnerId);
      } catch (err) { console.error('Statsien tallennus epäonnistui:', err); }
    }

    // TÄRKEÄ KORJAUS: ei enää cleanupRoom() tässä — pelaajat pysyvät huoneessa
    // jotta "Pelaa uudestaan" / "Takaisin lobbyyn" toimivat.
    gameStarted[roomCode] = false;
    clearTimeout(nextRoundTimers[roomCode]);
    delete nextRoundTimers[roomCode];
    delete pendingNextRoundNumber[roomCode];
    return;
  }

  const speed = gameSpeed[roomCode] || 'fast';
  if (speed === 'relaxed') {
    startReadyCheck(roomCode, 'round-gap');
  } else {
    const gapMs = (roundGapSeconds[roomCode] || 5) * 1000;
    nextRoundTimers[roomCode] = setTimeout(() => {
      startRound(roomCode, roundNumber + 1);
    }, gapMs);
  }
}

function convertToBot(roomCode: string, userId: number) {
  const players = roomPlayers[roomCode];
  if (!players) return;
  const player = players.find(p => p.userId === userId);
  if (!player || player.isConnected) return;

  player.isBot = true;
  player.wasHost = false;
  delete disconnectTimers[roomCode]?.[userId];
  io.to(roomCode).emit('room:players', { players: roomPlayers[roomCode] });

  if (!hasConnectedPlayers(roomCode)) { cleanupRoom(roomCode); return; }

  if (awaitingReady[roomCode]) {
    if (!readyPlayers[roomCode]) readyPlayers[roomCode] = new Set();
    readyPlayers[roomCode]!.add(userId);
    const readyNames = players.filter(p => readyPlayers[roomCode]!.has(p.userId)).map(p => p.username);
    io.to(roomCode).emit('ready:status', { readyNames, total: players.length });
    checkAllReady(roomCode);
  } else {
    checkResumeAfterPlayerReady(roomCode);
  }
}

// Päättää pelin kun liian moni on poistunut (alle 2 pelaajaa jäljellä); jäljelle jäänyt voittaa
async function endGameByForfeit(roomCode: string) {
  clearTimeout(roundTimers[roomCode]); delete roundTimers[roomCode];
  clearTimeout(nextRoundTimers[roomCode]); delete nextRoundTimers[roomCode];
  delete pendingNextRoundNumber[roomCode];
  awaitingReady[roomCode] = false;
  roundPaused[roomCode] = false;
  currentRound[roomCode] = -1;
  gameStarted[roomCode] = false;

  const players = roomPlayers[roomCode] || [];
  const winner = players[0]?.username ?? null;
  const finalWins = players.map(p => ({ username: p.username, wins: gameWins[roomCode]?.[p.userId] || 0 }));
  gameOverWinnerByRoom[roomCode] = winner;
  io.to(roomCode).emit('game:over', { winner, finalWins, reason: 'forfeit' });
  console.log(`Huone ${roomCode}: peli päättyi, muut pelaajat poistuivat`);

  const gameId = gameIdByRoom[roomCode];
  if (gameId) {
    try {
      const playerWins = players.map(p => ({ userId: p.userId, wins: gameWins[roomCode]?.[p.userId] || 0 }));
      await finalizeGame(gameId, gameMode[roomCode] || 'classic', playerWins, symbolStatsByRoom[roomCode] || {}, players[0]?.userId ?? null);
    } catch (err) { console.error('Statsien tallennus epäonnistui:', err); }
  }
}

// Poistaa pelaajan huoneesta (Exit game, tai yhteyden katkeaminen kun peli ei ole käynnissä)
function removePlayerFromRoom(roomCode: string, userId: number) {
  const players = roomPlayers[roomCode];
  if (!players) return;
  const player = players.find(p => p.userId === userId);
  if (!player) return;

  const remaining = players.filter(p => p.userId !== userId);
  roomPlayers[roomCode] = remaining;
  clearTimeout(disconnectTimers[roomCode]?.[userId]);
  delete disconnectTimers[roomCode]?.[userId];

  if (!remaining.some(p => p.isConnected)) { cleanupRoom(roomCode); return; }

  if (!remaining.some(p => p.isHost)) {
    const nextHost = remaining.find(p => p.isConnected && !p.isBot) ?? remaining[0]!;
    remaining.forEach(p => (p.wasHost = false));
    nextHost.isHost = true;
  }
  delete roundPicks[roomCode]?.[userId];
  readyPlayers[roomCode]?.delete(userId);
  io.to(roomCode).emit('room:players', { players: remaining });

  if (!gameStarted[roomCode]) return;
  if (remaining.length < 2) { endGameByForfeit(roomCode); return; }

  if (awaitingReady[roomCode]) {
    const readyNames = remaining.filter(p => readyPlayers[roomCode]?.has(p.userId)).map(p => p.username);
    io.to(roomCode).emit('ready:status', { readyNames, total: remaining.length });
    checkAllReady(roomCode);
    return;
  }
  const roundNumber = currentRound[roomCode];
  if (roundNumber && roundNumber !== -1 && !roundPaused[roomCode]) checkAllPicked(roomCode, roundNumber);
}

function checkResumeAfterPlayerReady(roomCode: string) {
  broadcastPauseState(roomCode);
  if (anyPlayerWaiting(roomCode)) return;
  // Valmiustarkistuksen aikana peli jatkuu vasta kun kaikki ovat valmiita (checkAllReady)
  if (awaitingReady[roomCode]) return;

  if (roundPaused[roomCode]) {
    const roundNumber = currentRound[roomCode];
    if (roundNumber && roundNumber !== -1) startRound(roomCode, roundNumber, true);
    return;
  }
  if (pendingNextRoundNumber[roomCode] !== undefined) {
    const next = pendingNextRoundNumber[roomCode]!;
    delete pendingNextRoundNumber[roomCode];
    nextRoundTimers[roomCode] = setTimeout(() => startRound(roomCode, next), 1000);
  }
}

// Lähettää liittyvälle pelaajalle koko pelin nykytilan, jotta sivun päivitys
// tai yhteyden katkeaminen ei pudota häntä väärään näkymään.
function sendRoomState(socket: AuthenticatedSocket, roomCode: string) {
  const players = roomPlayers[roomCode] || [];
  const round = currentRound[roomCode];
  const roundActive = !!round && round !== -1;
  const dnfSet = dnfByRoom[roomCode] || new Set<number>();
  const picks = roundPicks[roomCode] || {};
  const inProgress = !!gameStarted[roomCode];
  const gameOverWinner = gameOverWinnerByRoom[roomCode];

  socket.emit('room:state', {
    mode: gameMode[roomCode] || 'classic',
    winsRequired: winsRequired[roomCode] || 3,
    roundNumber: roundActive ? round : (inProgress || gameOverWinner !== undefined) ? (lastCompletedRound[roomCode] ?? null) : null,
    roundActive,
    duration: roundActive ? getRoundDuration(roomCode, round) : null,
    remainingSeconds: roundActive && !roundPaused[roomCode]
      ? Math.max(Math.ceil(((roundTimerEndAt[roomCode] || Date.now()) - Date.now()) / 1000), 1)
      : null,
    myPick: roundActive ? (picks[socket.userId!] ?? null) : null,
    pickCount: roundActive ? {
      picked: Object.keys(picks).length,
      total: players.filter(p => !dnfSet.has(p.userId)).length,
      pickedNames: players.filter(p => picks[p.userId] !== undefined).map(p => p.username),
    } : null,
    reveal: !roundActive ? (lastRevealByRoom[roomCode] ?? null) : null,
    wins: players.map(p => ({ username: p.username, wins: gameWins[roomCode]?.[p.userId] || 0 })),
    hearts: heartsSnapshot(roomCode),
    dnf: players.filter(p => dnfSet.has(p.userId)).map(p => p.username),
    ready: awaitingReady[roomCode] ? {
      reason: readyReasonByRoom[roomCode],
      readyNames: players.filter(p => readyPlayers[roomCode]?.has(p.userId)).map(p => p.username),
      total: players.length,
      pausedByName: pausedByNameByRoom[roomCode] ?? null,
    } : null,
    gameOverWinner: !inProgress ? (gameOverWinner ?? null) : null,
    settings: lobbySettingsByRoom[roomCode] ?? null,
  });
}

// Viestien määrän rajoitus per yhteys: tavallinen pelaaminen lähettää muutaman viestin sekunnissa
const EVENTS_PER_SECOND = 20;
const MAX_REJECTED_JOINS = 15;
const EVENT_BURST = 40;

// Jokainen asiakkaan tapahtuma ajetaan tämän kautta: huonekoodi tarkistetaan ja normalisoidaan,
// liian tiheät viestit hylätään, eikä yksittäisen käsittelijän virhe voi kaataa koko palvelinta.
function onEvent(
  socket: AuthenticatedSocket,
  event: string,
  handler: (payload: Record<string, any> & { roomCode: string }) => unknown,
) {
  let tokens = EVENT_BURST;
  let last = Date.now();
  socket.on(event, (payload: unknown) => {
    const now = Date.now();
    tokens = Math.min(EVENT_BURST, tokens + ((now - last) / 1000) * EVENTS_PER_SECOND);
    last = now;
    if (tokens < 1) return;
    tokens -= 1;

    const data = payload && typeof payload === 'object' && !Array.isArray(payload) ? payload as Record<string, any> : {};
    const roomCode = parseRoomCode(data.roomCode);
    if (!roomCode) return;
    try {
      const result = handler({ ...data, roomCode });
      if (result instanceof Promise) result.catch(err => console.error(`Virhe tapahtumassa ${event}:`, err));
    } catch (err) {
      console.error(`Virhe tapahtumassa ${event}:`, err);
    }
  });
}

io.on('connection', (socket: AuthenticatedSocket) => {
  // Huonekoodien arvailun esto: liian monta hylättyä liittymistä katkaisee yhteyden
  let rejectedJoins = 0;

  onEvent(socket, 'room:join', async ({ roomCode }) => {
    const reject = (message: string) => {
      socket.emit('room:joinRejected', { message });
      rejectedJoins += 1;
      if (rejectedJoins > MAX_REJECTED_JOINS) socket.disconnect(true);
    };

    // Huone ei ole muistissa: tarkistetaan tietokannasta että se on olemassa eikä peli ole jo pelattu
    if (!roomPlayers[roomCode]) {
      let game;
      try {
        game = await getLatestGameByRoomCode(roomCode);
      } catch (err) {
        console.error(err);
        reject('Palvelinvirhe');
        return;
      }
      if (!game) { reject('Huonetta ei löytynyt'); return; }
      if (!roomPlayers[roomCode]) {
        if (game.status !== 'lobby') { reject('Tämä peli on jo päättynyt'); return; }
        roomPlayers[roomCode] = [];
        roomCreatorByRoom[roomCode] = game.hostUserId;
      }
    }

    const joinError = getRoomJoinError(roomCode, socket.userId!);
    if (joinError) { reject(joinError); return; }

    let avatar = { avatarEmoji: null as string | null, avatarColor: null as string | null, avatarImage: null as string | null };
    try {
      avatar = await getUserAvatar(socket.userId!);
    } catch (err) {
      console.error('Profiilikuvan haku epäonnistui:', err);
    }

    socket.join(roomCode);
    const players = roomPlayers[roomCode]!;
    const existing = players.find(p => p.userId === socket.userId);
    let wasWaiting = false;

    if (existing) {
      wasWaiting = !existing.isConnected;
      existing.socketId = socket.id;
      existing.isConnected = true;
      Object.assign(existing, avatar, { username: socket.username! });
      existing.isBot = false;

      const timer = disconnectTimers[roomCode]?.[socket.userId!];
      if (timer) { clearTimeout(timer); delete disconnectTimers[roomCode]![socket.userId!]; }
      const graceTimer = pauseGraceTimers[roomCode]?.[socket.userId!];
      if (graceTimer) { clearTimeout(graceTimer); delete pauseGraceTimers[roomCode]![socket.userId!]; }

      if (existing.wasHost) {
        players.forEach(p => (p.isHost = false));
        existing.isHost = true;
        existing.wasHost = false;
      }
    } else {
      // Huoneen luoja on aina host; muuten host on se joka ehti ensin
      const isCreator = socket.userId === roomCreatorByRoom[roomCode];
      if (isCreator) players.forEach(p => (p.isHost = false));
      const isHost = isCreator || !players.some(p => p.isHost);
      players.push({
        socketId: socket.id, userId: socket.userId!, username: socket.username!,
        isHost, wasHost: false, isConnected: true, isBot: false, ...avatar,
      });
    }

    io.to(roomCode).emit('room:players', { players: roomPlayers[roomCode] });
    sendRoomState(socket, roomCode);
    if (wasWaiting) checkResumeAfterPlayerReady(roomCode);
  });

  onEvent(socket, 'room:leave', ({ roomCode }) => {
    const players = roomPlayers[roomCode];
    if (!players) return;
    const player = players.find(p => p.socketId === socket.id);
    if (!player) return;

    socket.leave(roomCode);
    removePlayerFromRoom(roomCode, player.userId);
  });

  // Host voi täyttää vapaita paikkoja boteilla ennen pelin alkua (testaus ja yksinpeli)
  onEvent(socket, 'room:addBot', ({ roomCode }) => {
    const players = roomPlayers[roomCode];
    const player = players?.find(p => p.socketId === socket.id);
    if (!players || !player?.isHost || gameStarted[roomCode]) return;
    if (players.length >= MAX_PLAYERS) {
      socket.emit('error:message', { message: 'Huone on täynnä' });
      return;
    }
    const takenNames = new Set(players.map(p => p.username));
    const name = BOT_NAMES.find(n => !takenNames.has(n)) ?? `Botti ${players.length + 1}`;
    // Botit eivät ole "yhdistettyjä", jotta huone siivotaan kun viimeinen ihminen lähtee
    players.push({
      socketId: '', userId: nextBotUserId--, username: name,
      isHost: false, wasHost: false, isConnected: false, isBot: true,
    });
    io.to(roomCode).emit('room:players', { players });
  });

  onEvent(socket, 'room:removeBot', ({ roomCode, userId }) => {
    const players = roomPlayers[roomCode];
    const player = players?.find(p => p.socketId === socket.id);
    if (!players || !player?.isHost || gameStarted[roomCode] || userId >= 0) return;
    roomPlayers[roomCode] = players.filter(p => p.userId !== userId);
    io.to(roomCode).emit('room:players', { players: roomPlayers[roomCode] });
  });

  onEvent(socket, 'settings:update', ({ roomCode, settings }) => {
    const player = roomPlayers[roomCode]?.find(p => p.socketId === socket.id);
    if (!player?.isHost || gameStarted[roomCode]) return;
    lobbySettingsByRoom[roomCode] = sanitizeSettings(settings);
    socket.to(roomCode).emit('settings:update', lobbySettingsByRoom[roomCode]);
  });

  onEvent(socket, 'game:start', async ({ roomCode, winsRequired: reqWins, mode, speed, roundGap, firstRoundSeconds, laterRoundSeconds }) => {
    const players = roomPlayers[roomCode];
    if (!players) return;

    const player = players.find(p => p.socketId === socket.id);
    if (!player || !player.isHost) {
      socket.emit('error:message', { message: 'Vain host voi aloittaa pelin' });
      return;
    }

    if (gameStarted[roomCode]) return;
    if (players.length < 2) {
      socket.emit('error:message', { message: 'Tarvitaan vähintään 2 pelaajaa' });
      return;
    }

    try {
      // Uusinnassa ("Takaisin lobbyyn") pelirivi on jo luotu, muuten haetaan huonekoodilla
      const gameId = gameIdByRoom[roomCode] ?? await getGameIdByRoomCode(roomCode);
      if (!gameId) { socket.emit('error:message', { message: 'Huonetta ei löytynyt' }); return; }
      gameIdByRoom[roomCode] = gameId;
      await markGameStarted(gameId, players.map(p => p.userId));
    } catch (err) {
      console.error(err);
      socket.emit('error:message', { message: 'Palvelinvirhe' });
      return;
    }

    const settings = sanitizeSettings({ winsRequired: reqWins, mode, speed, roundGap, firstRoundSeconds, laterRoundSeconds });
    winsRequired[roomCode] = settings.winsRequired;
    gameMode[roomCode] = settings.mode;
    gameSpeed[roomCode] = settings.speed;
    roundGapSeconds[roomCode] = settings.roundGap;
    firstRoundDuration[roomCode] = settings.firstRoundSeconds;
    laterRoundDuration[roomCode] = settings.laterRoundSeconds;
    gameWins[roomCode] = {};
    symbolStatsByRoom[roomCode] = {};
    heartsByRoom[roomCode] = {};
    players.forEach(p => { heartsByRoom[roomCode]![p.userId] = STARTING_HEARTS; });
    gameStarted[roomCode] = true;
    delete lastCompletedRound[roomCode];

    startReadyCheck(roomCode, 'game-start');
  });

  onEvent(socket, 'ready:submit', ({ roomCode }) => {
    if (!socket.userId) return;
    if (!awaitingReady[roomCode]) return;
    if (!roomPlayers[roomCode]?.some(p => p.userId === socket.userId)) return;

    if (!readyPlayers[roomCode]) readyPlayers[roomCode] = new Set();
    readyPlayers[roomCode]!.add(socket.userId);

    const players = roomPlayers[roomCode] || [];
    const readyNames = players.filter(p => readyPlayers[roomCode]!.has(p.userId)).map(p => p.username);
    io.to(roomCode).emit('ready:status', { readyNames, total: players.length });

    checkAllReady(roomCode);
  });

  onEvent(socket, 'ready:cancel', ({ roomCode }) => {
    if (!socket.userId) return;
    if (!awaitingReady[roomCode]) return;

    readyPlayers[roomCode]?.delete(socket.userId);

    const players = roomPlayers[roomCode] || [];
    const readyNames = players.filter(p => readyPlayers[roomCode]?.has(p.userId)).map(p => p.username);
    io.to(roomCode).emit('ready:status', { readyNames, total: players.length });
  });

  onEvent(socket, 'game:replay', async ({ roomCode, autoStart, mode, winsRequired: reqWins }) => {
    const players = roomPlayers[roomCode];
    if (!players) {
      socket.emit('error:message', { message: 'Huonetta ei löytynyt palvelimelta' });
      return;
    }
    const player = players.find(p => p.socketId === socket.id);
    if (!player || !player.isHost) {
      socket.emit('error:message', { message: 'Vain host voi aloittaa uuden pelin' });
      return;
    }

    const finalMode = mode === 'extended' ? 'extended' : 'classic';
    const finalWins = clampWinsRequired(reqWins);

    if (autoStart && players.length < 2) {
      socket.emit('error:message', { message: 'Tarvitaan vähintään 2 pelaajaa' });
      return;
    }

    try {
      const gameId = await createGameRow(finalMode, finalWins, player.userId, players.map(p => p.userId));
      gameIdByRoom[roomCode] = gameId;
      if (autoStart) await markGameStarted(gameId, players.map(p => p.userId));
    } catch (err) {
      console.error('Uuden pelin luonti epäonnistui:', err);
      socket.emit('error:message', { message: 'Palvelinvirhe' });
      return;
    }

    gameWins[roomCode] = {};
    symbolStatsByRoom[roomCode] = {};
    heartsByRoom[roomCode] = {};
    players.forEach(p => { heartsByRoom[roomCode]![p.userId] = STARTING_HEARTS; });
    dnfByRoom[roomCode] = new Set();
    roundPicks[roomCode] = {};
    currentRound[roomCode] = -1;
    delete lastCompletedRound[roomCode];
    winsRequired[roomCode] = finalWins;
    gameMode[roomCode] = finalMode;
    delete lastRevealByRoom[roomCode];
    delete gameOverWinnerByRoom[roomCode];

    if (autoStart) {
      gameStarted[roomCode] = true;
      startReadyCheck(roomCode, 'game-start');
    } else {
      gameStarted[roomCode] = false;
      io.to(roomCode).emit('game:reset', { mode: finalMode, winsRequired: finalWins });
    }
  });

  onEvent(socket, 'pick:submit', ({ roomCode, symbol }) => {
    if (!socket.userId) return;
    submitPick(roomCode, socket.userId, symbol);
  });

  // Tauko pysäyttää pelin aina kaikilta; peli jatkuu kun kaikki ovat kuitanneet olevansa valmiita.
  // Kesken kierroksen pysäytetty kierros aloitetaan tauon jälkeen alusta (valintoja ei paljasteta).
  onEvent(socket, 'game:pauseToggle', ({ roomCode }) => {
    const players = roomPlayers[roomCode];
    if (!players || !socket.userId) return;
    const player = players.find(p => p.userId === socket.userId);
    if (!player || !gameStarted[roomCode] || awaitingReady[roomCode]) return;

    const roundNumber = currentRound[roomCode];
    if (roundNumber && roundNumber !== -1 && roundTimers[roomCode]) {
      clearTimeout(roundTimers[roomCode]);
      delete roundTimers[roomCode];
      roundPaused[roomCode] = true;
    }
    clearTimeout(nextRoundTimers[roomCode]);
    delete nextRoundTimers[roomCode];
    pausedByNameByRoom[roomCode] = player.username;
    io.to(roomCode).emit('game:pausedBy', { username: player.username });
    startReadyCheck(roomCode, 'manual-pause');
  });

  socket.on('disconnect', () => {
    for (const roomCode in roomPlayers) {
      const players = roomPlayers[roomCode]!;
      const player = players.find(p => p.socketId === socket.id && p.isConnected);
      if (!player) continue;

      if (!gameStarted[roomCode]) {
        removePlayerFromRoom(roomCode, player.userId);
        continue;
      }

      player.isConnected = false;
      if (player.isHost) {
        player.isHost = false;
        player.wasHost = true;
        const nextHost = players.find(p => p.isConnected && !p.isBot);
        if (nextHost) nextHost.isHost = true;
      }

      // Lyhyt katkos (esim. sivun päivitys) ei keskeytä kierrosta: odotetaan hetki ennen tauotusta.
      // Jos pelaaja palaa sinä aikana, kierros jatkuu ja hänen valintansa säilyy.
      if (!pauseGraceTimers[roomCode]) pauseGraceTimers[roomCode] = {};
      pauseGraceTimers[roomCode]![player.userId] = setTimeout(() => {
        delete pauseGraceTimers[roomCode]?.[player.userId];
        if (player.isConnected || !roomPlayers[roomCode]?.includes(player)) return;
        pauseRound(roomCode);
        broadcastPauseState(roomCode);
      }, PAUSE_GRACE_MS);

      if (!disconnectTimers[roomCode]) disconnectTimers[roomCode] = {};
      disconnectTimers[roomCode]![player.userId] = setTimeout(() => convertToBot(roomCode, player.userId), RECONNECT_GRACE_MS);

      io.to(roomCode).emit('room:players', { players: roomPlayers[roomCode] });
    }
  });
});

// Odottamaton virhe kirjataan lokiin sen sijaan että koko palvelin kaatuisi
process.on('unhandledRejection', err => console.error('Käsittelemätön virhe:', err));
process.on('uncaughtException', err => console.error('Odottamaton virhe:', err));

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => console.log(`Server running on port ${PORT}`));

// Hallittu sammutus (esim. Render julkaisee uuden version): suljetaan yhteydet siististi
process.on('SIGTERM', () => {
  console.log('SIGTERM: sammutetaan palvelin');
  io.close();
  httpServer.close(() => pool.end().finally(() => process.exit(0)));
  setTimeout(() => process.exit(0), 8000).unref();
});