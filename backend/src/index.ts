import express from 'express';
import { createServer } from 'http';
import { Server, Socket } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';
import { pool } from './db/pool';
import authRoutes from './routes/auth';
import gameRoutes from './routes/games';
import { getGameIdByRoomCode, saveRound, finalizeGame, createGameRow } from './db/gameQueries';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

app.use('/api/games', gameRoutes);
app.use('/api/auth', authRoutes);

const httpServer = createServer(app);
const io = new Server(httpServer, { cors: { origin: '*' } });

app.get('/api/health', async (req, res) => {
  try {
    const result = await pool.query('SELECT NOW()');
    res.json({ status: 'ok', dbTime: result.rows[0].now });
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: 'error', message: 'Database connection failed' });
  }
});

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
}

interface SymbolStat { count: number; wins: number; losses: number; draws: number; }

const RECONNECT_GRACE_MS = 60 * 1000;
const STARTING_HEARTS = 3;

const roomPlayers: Record<string, RoomPlayer[]> = {};
const roundTimers: Record<string, NodeJS.Timeout> = {};
const nextRoundTimers: Record<string, NodeJS.Timeout> = {};
const disconnectTimers: Record<string, Record<number, NodeJS.Timeout>> = {};
const roundPicks: Record<string, Record<number, string>> = {};
const currentRound: Record<string, number> = {};
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

function getRoundDuration(roundNumber: number): number {
  return roundNumber === 1 ? 10 : 5;
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
  delete roomPlayers[roomCode]; delete roundTimers[roomCode]; delete nextRoundTimers[roomCode];
  delete disconnectTimers[roomCode]; delete roundPicks[roomCode]; delete currentRound[roomCode];
  delete gameWins[roomCode]; delete winsRequired[roomCode]; delete gameMode[roomCode];
  delete gameIdByRoom[roomCode]; delete symbolStatsByRoom[roomCode]; delete gameStarted[roomCode];
  delete roundPaused[roomCode]; delete pendingNextRoundNumber[roomCode];
  delete heartsByRoom[roomCode]; delete dnfByRoom[roomCode];
  console.log(`Huone ${roomCode}: siivottu kokonaan`);
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

  if (pickedUserIds.length >= required.length) {
    resolveRound(roomCode, roundNumber);
  }
}

function startRound(roomCode: string, roundNumber: number, resetDnf: boolean = true) {
  if (resetDnf) dnfByRoom[roomCode] = new Set();
  roundPaused[roomCode] = false;
  currentRound[roomCode] = roundNumber;
  roundPicks[roomCode] = {};

  const duration = getRoundDuration(roundNumber);
  const dnfNames = Array.from(dnfByRoom[roomCode] || []).map(
    id => roomPlayers[roomCode]?.find(p => p.userId === id)?.username
  ).filter(Boolean);

  io.to(roomCode).emit('round:start', { roundNumber, duration, mode: gameMode[roomCode], dnf: dnfNames, hearts: heartsSnapshot(roomCode) });
  console.log(`Huone ${roomCode}: kierros ${roundNumber} alkoi (${duration}s)`);

  const players = roomPlayers[roomCode] || [];
  players.filter(p => p.isBot && !dnfByRoom[roomCode]?.has(p.userId)).forEach(p => {
    submitPick(roomCode, p.userId, getRandomSymbol(gameMode[roomCode] || 'classic'));
  });

  roundTimers[roomCode] = setTimeout(() => handleTimeout(roomCode, roundNumber), duration * 1000);
}

function handleTimeout(roomCode: string, roundNumber: number) {
  if (currentRound[roomCode] !== roundNumber) return;

  const players = roomPlayers[roomCode] || [];
  const dnfSet = dnfByRoom[roomCode] || (dnfByRoom[roomCode] = new Set());
  const missing = players.filter(p => !p.isBot && !dnfSet.has(p.userId) && roundPicks[roomCode]?.[p.userId] === undefined);

  if (missing.length === 0) {
    resolveRound(roomCode, roundNumber);
    return;
  }

  if (!heartsByRoom[roomCode]) heartsByRoom[roomCode] = {};
  const mode = gameMode[roomCode] || 'classic';

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
      startRound(roomCode, roundNumber, false);
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
    activePlayers.filter(p => p.isBot).forEach(p => {
      roundPicks[roomCode]![p.userId] = getRandomSymbol(mode);
    });
    const duration = getRoundDuration(roundNumber);
    io.to(roomCode).emit('round:start', {
      roundNumber, duration, mode,
      dnf: Array.from(dnfSet).map(id => players.find(p => p.userId === id)?.username).filter(Boolean),
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
  console.log(`Huone ${roomCode}: kierros ${roundNumber} paljastettu, voittajat: ${winnerNames.join(', ') || 'ei ketään'}`);

  currentRound[roomCode] = -1;

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

    if (gameId) {
      try {
        const playerWins = players.map(p => ({ userId: p.userId, wins: gameWins[roomCode]?.[p.userId] || 0 }));
        await finalizeGame(gameId, mode, playerWins, symbolStatsByRoom[roomCode] || {});
      } catch (err) { console.error('Statsien tallennus epäonnistui:', err); }
    }

    // Ei siivota huonetta kokonaan: pelaajat jäävät odottamaan replay/lobby-valintaa
    gameStarted[roomCode] = false;
    roundPaused[roomCode] = false;
    delete pendingNextRoundNumber[roomCode];
    return;
  }

  if (anyPlayerWaiting(roomCode)) {
    pendingNextRoundNumber[roomCode] = roundNumber + 1;
    broadcastPauseState(roomCode);
    return;
  }

  nextRoundTimers[roomCode] = setTimeout(() => startRound(roomCode, roundNumber + 1), 3000);
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
  checkResumeAfterPlayerReady(roomCode);
}

function checkResumeAfterPlayerReady(roomCode: string) {
  broadcastPauseState(roomCode);
  if (anyPlayerWaiting(roomCode)) return;

  if (roundPaused[roomCode]) {
    const roundNumber = currentRound[roomCode];
    if (roundNumber && roundNumber !== -1) startRound(roomCode, roundNumber, false);
    return;
  }
  if (pendingNextRoundNumber[roomCode] !== undefined) {
    const next = pendingNextRoundNumber[roomCode]!;
    delete pendingNextRoundNumber[roomCode];
    nextRoundTimers[roomCode] = setTimeout(() => startRound(roomCode, next), 1000);
  }
}

io.on('connection', (socket: AuthenticatedSocket) => {
  socket.on('room:join', ({ roomCode }: { roomCode: string }) => {
    socket.join(roomCode);
    if (!roomPlayers[roomCode]) roomPlayers[roomCode] = [];

    const existing = roomPlayers[roomCode].find(p => p.userId === socket.userId);
    let wasWaiting = false;

    if (existing) {
      wasWaiting = !existing.isConnected;
      existing.socketId = socket.id;
      existing.isConnected = true;
      existing.isBot = false;

      const timer = disconnectTimers[roomCode]?.[socket.userId!];
      if (timer) { clearTimeout(timer); delete disconnectTimers[roomCode]![socket.userId!]; }

      if (existing.wasHost) {
        roomPlayers[roomCode].forEach(p => (p.isHost = false));
        existing.isHost = true;
        existing.wasHost = false;
      }
    } else {
      const isHost = roomPlayers[roomCode].length === 0;
      roomPlayers[roomCode].push({
        socketId: socket.id, userId: socket.userId!, username: socket.username!,
        isHost, wasHost: false, isConnected: true, isBot: false,
      });
    }

    io.to(roomCode).emit('room:players', { players: roomPlayers[roomCode] });
    if (wasWaiting) checkResumeAfterPlayerReady(roomCode);
  });

  socket.on('room:leave', ({ roomCode }: { roomCode: string }) => {
    const players = roomPlayers[roomCode];
    if (!players) return;
    const player = players.find(p => p.socketId === socket.id);
    if (!player) return;

    const wasHost = player.isHost;
    roomPlayers[roomCode] = players.filter(p => p.userId !== player.userId);
    socket.leave(roomCode);

    if (roomPlayers[roomCode]!.length === 0) {
      cleanupRoom(roomCode);
      return;
    }
    if (wasHost) roomPlayers[roomCode]![0]!.isHost = true;
    io.to(roomCode).emit('room:players', { players: roomPlayers[roomCode] });
  });

  socket.on('game:start', async ({ roomCode, winsRequired: reqWins, mode }: { roomCode: string; winsRequired?: number; mode?: 'classic' | 'extended' }) => {
    const players = roomPlayers[roomCode];
    if (!players) return;
    const player = players.find(p => p.socketId === socket.id);
    if (!player || !player.isHost) {
      socket.emit('error:message', { message: 'Vain host voi aloittaa pelin' });
      return;
    }

    try {
      const gameId = await getGameIdByRoomCode(roomCode);
      if (!gameId) { socket.emit('error:message', { message: 'Huonetta ei löytynyt' }); return; }
      gameIdByRoom[roomCode] = gameId;
    } catch (err) {
      socket.emit('error:message', { message: 'Palvelinvirhe' });
      return;
    }

    winsRequired[roomCode] = reqWins || 3;
    gameMode[roomCode] = mode === 'extended' ? 'extended' : 'classic';
    gameWins[roomCode] = {};
    symbolStatsByRoom[roomCode] = {};
    heartsByRoom[roomCode] = {};
    players.forEach(p => { heartsByRoom[roomCode]![p.userId] = STARTING_HEARTS; });
    gameStarted[roomCode] = true;
    startRound(roomCode, 1);
  });

  socket.on('game:replay', async ({ roomCode, autoStart, mode, winsRequired: reqWins }: { roomCode: string; autoStart: boolean; mode?: 'classic' | 'extended'; winsRequired?: number }) => {
    const players = roomPlayers[roomCode];
    if (!players) return;
    const player = players.find(p => p.socketId === socket.id);
    if (!player || !player.isHost) {
      socket.emit('error:message', { message: 'Vain host voi aloittaa uuden pelin' });
      return;
    }

    const finalMode = mode === 'extended' ? 'extended' : 'classic';
    const finalWins = reqWins || 3;

    try {
      const gameId = await createGameRow(finalMode, finalWins, player.userId, players.map(p => p.userId));
      gameIdByRoom[roomCode] = gameId;
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
    winsRequired[roomCode] = finalWins;
    gameMode[roomCode] = finalMode;

    if (autoStart) {
      gameStarted[roomCode] = true;
      startRound(roomCode, 1);
    } else {
      gameStarted[roomCode] = false;
      io.to(roomCode).emit('game:reset', { mode: finalMode, winsRequired: finalWins });
    }
  });

  socket.on('pick:submit', ({ roomCode, symbol }: { roomCode: string; symbol: string }) => {
    if (!socket.userId) return;
    submitPick(roomCode, socket.userId, symbol);
  });

  socket.on('disconnect', () => {
    for (const roomCode in roomPlayers) {
      const players = roomPlayers[roomCode]!;
      const player = players.find(p => p.socketId === socket.id && p.isConnected);
      if (!player) continue;

      if (!gameStarted[roomCode]) {
        const wasHost = player.isHost;
        roomPlayers[roomCode] = players.filter(p => p.userId !== player.userId);
        if (roomPlayers[roomCode]!.length === 0) { cleanupRoom(roomCode); continue; }
        if (wasHost) roomPlayers[roomCode]![0]!.isHost = true;
        io.to(roomCode).emit('room:players', { players: roomPlayers[roomCode] });
        continue;
      }

      player.isConnected = false;
      if (player.isHost) {
        player.isHost = false;
        player.wasHost = true;
        const nextHost = players.find(p => p.isConnected && !p.isBot);
        if (nextHost) nextHost.isHost = true;
      }

      pauseRound(roomCode);
      broadcastPauseState(roomCode);

      if (!disconnectTimers[roomCode]) disconnectTimers[roomCode] = {};
      disconnectTimers[roomCode]![player.userId] = setTimeout(() => convertToBot(roomCode, player.userId), RECONNECT_GRACE_MS);

      io.to(roomCode).emit('room:players', { players: roomPlayers[roomCode] });
    }
  });
});

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => console.log(`Server running on port ${PORT}`));