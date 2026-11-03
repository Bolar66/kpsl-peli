import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../hooks/useSocket';
import GameTable from '../components/GameTable';
import PickButtons from '../components/PickButtons';
import GameOverModal from '../components/GameOverModal';
import ReadyCheckModal from '../components/ReadyCheckModal';
import PauseMenu from '../components/PauseMenu';
import RoundWinnerBanner from '../components/RoundWinnerBanner';
import RoomLobby, { type LobbySettings } from '../components/RoomLobby';
import { explainWin, MODE_LABEL, type GameMode } from '../constants/symbols';
import { haptic } from '../constants/players';
import { isMuted, setMuted, sfx } from '../constants/sound';
import './Room.css';

interface Player {
  socketId: string;
  userId: number;
  username: string;
  isHost: boolean;
  isConnected: boolean;
  isBot: boolean;
  avatarEmoji?: string | null;
  avatarColor?: string | null;
  avatarImage?: string | null;
}

interface RevealResult {
  username: string;
  symbol: string | null;
  dnf: boolean;
}

interface WinsEntry {
  username: string;
  wins: number;
}

interface HeartsEntry {
  username: string;
  hearts: number;
}

type ReadyReason = 'game-start' | 'round-gap' | 'manual-pause';

const DEFAULT_SETTINGS: LobbySettings = {
  mode: 'classic',
  winsRequired: 3,
  speed: 'fast',
  firstRoundSeconds: 15,
  laterRoundSeconds: 8,
  roundGap: 5,
};

export default function Room() {
  const { roomCode } = useParams();
  const { token, user, logout } = useAuth();
  const { socket, connected } = useSocket(token);
  const navigate = useNavigate();

  const [players, setPlayers] = useState<Player[]>([]);
  const [settings, setSettings] = useState<LobbySettings>(DEFAULT_SETTINGS);
  const [mode, setMode] = useState<GameMode>('classic');
  const [winsRequired, setWinsRequired] = useState(3);
  const [roundNumber, setRoundNumber] = useState<number | null>(null);
  const [duration, setDuration] = useState(10);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [hasPicked, setHasPicked] = useState(false);
  const [pickedSymbol, setPickedSymbol] = useState<string | null>(null);
  const [pickCount, setPickCount] = useState<{ picked: number; total: number; pickedNames: string[] } | null>(null);
  const [revealResults, setRevealResults] = useState<RevealResult[] | null>(null);
  const [winners, setWinners] = useState<string[]>([]);
  const [isDraw, setIsDraw] = useState(false);
  const [wins, setWins] = useState<WinsEntry[]>([]);
  const [hearts, setHearts] = useState<HeartsEntry[]>([]);
  const [dnfPlayers, setDnfPlayers] = useState<string[]>([]);
  const [gameOverWinner, setGameOverWinner] = useState<string | null>(null);
  const [gameOverReason, setGameOverReason] = useState<'forfeit' | null>(null);
  const [finalWins, setFinalWins] = useState<WinsEntry[] | null>(null);
  const [joinRejected, setJoinRejected] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [paused, setPaused] = useState(false);
  const [waitingFor, setWaitingFor] = useState<string[]>([]);
  const [retryMessage, setRetryMessage] = useState('');

  const [readyCheckActive, setReadyCheckActive] = useState(false);
  const [readyReason, setReadyReason] = useState<ReadyReason | null>(null);
  const [pausedByName, setPausedByName] = useState<string | null>(null);
  const [readyNames, setReadyNames] = useState<string[]>([]);
  const [readyTotal, setReadyTotal] = useState(0);

  const [showWinnerBanner, setShowWinnerBanner] = useState(false);
  const [muted, setMutedState] = useState(isMuted());
  // Voittoputket: montako kierrosta peräkkäin kukin on voittanut
  const [streaks, setStreaks] = useState<Record<string, number>>({});

  const myName = user?.username || '';
  const me = players.find(p => p.userId === user?.id);
  const isHost = me?.isHost || false;
  const iAmDnf = dnfPlayers.includes(myName);
  const iAmReady = readyNames.includes(myName);

  useEffect(() => {
    if (!socket || !roomCode) return;

    // Liitytään huoneeseen aina kun yhteys muodostuu — myös katkenneen yhteyden palatessa
    function joinRoom() {
      socket!.emit('room:join', { roomCode });
    }

    socket.on('room:state', (state: {
      mode: GameMode;
      winsRequired: number;
      roundNumber: number | null;
      roundActive: boolean;
      duration: number | null;
      remainingSeconds: number | null;
      myPick: string | null;
      pickCount: { picked: number; total: number; pickedNames: string[] } | null;
      reveal: { results: RevealResult[]; winners: string[]; isDraw: boolean } | null;
      wins: WinsEntry[];
      hearts: HeartsEntry[];
      dnf: string[];
      ready: { reason: ReadyReason; readyNames: string[]; total: number; pausedByName: string | null } | null;
      gameOverWinner: string | null;
      settings: LobbySettings | null;
    }) => {
      setMode(state.mode);
      setWinsRequired(state.winsRequired);
      if (state.settings) setSettings(state.settings);
      setRoundNumber(state.roundNumber);
      if (state.duration !== null) setDuration(state.duration);
      setCountdown(state.remainingSeconds);
      setHasPicked(state.myPick !== null);
      setPickedSymbol(state.myPick);
      setPickCount(state.pickCount);
      setRevealResults(state.reveal?.results ?? null);
      setWinners(state.reveal?.winners ?? []);
      setIsDraw(state.reveal?.isDraw ?? false);
      setWins(state.roundNumber !== null || state.gameOverWinner ? state.wins : []);
      setHearts(state.hearts);
      setDnfPlayers(state.dnf);
      setReadyCheckActive(state.ready !== null);
      setReadyReason(state.ready?.reason ?? null);
      setReadyNames(state.ready?.readyNames ?? []);
      setReadyTotal(state.ready?.total ?? 0);
      setPausedByName(state.ready?.pausedByName ?? null);
      setGameOverWinner(state.gameOverWinner);
      setGameOverReason(null);
      setJoinRejected(null);
      setRetryMessage('');
      setShowWinnerBanner(false);
    });

    socket.on('room:players', ({ players }: { players: Player[] }) => setPlayers(players));

    socket.on('settings:update', (s: LobbySettings) => setSettings(s));

    socket.on('round:start', ({ roundNumber, duration: roundDuration, mode, dnf, hearts }: {
      roundNumber: number; duration: number; mode: GameMode; dnf: string[]; hearts: HeartsEntry[];
    }) => {
      setRoundNumber(roundNumber);
      setMode(mode);
      setHasPicked(false);
      setPickedSymbol(null);
      setPickCount(null);
      setRevealResults(null);
      setGameOverWinner(null);
      setDuration(roundDuration);
      setCountdown(roundDuration);
      setDnfPlayers(dnf || []);
      setHearts(hearts || []);
      setReadyCheckActive(false);
      setShowWinnerBanner(false);
      sfx.roundStart();
    });

    socket.on('round:retry', ({ reason }: { reason: string }) => {
      if (reason === 'draw') setRetryMessage('Tasapeli — uusi yritys!');
    });

    socket.on('round:missed', ({ names, retry }: { names: string[]; retry: boolean }) => {
      const iMissed = names.includes(user?.username ?? '');
      const others = names.filter(n => n !== user?.username);
      const who = iMissed ? (others.length ? `Sinä ja ${others.join(', ')}` : 'Et') : others.join(', ');
      const verb = iMissed && others.length === 0 ? 'ehtinyt valita' : 'ei ehtinyt valita';
      setRetryMessage(`${who} ${verb} — −1 ❤${retry ? ', kierros uusitaan' : ', käsi arvottiin'}`);
      if (iMissed) haptic([60, 40, 60]);
    });

    socket.on('pick:count', (data: { picked: number; total: number; pickedNames: string[] }) => {
      setPickCount(data);
      setRetryMessage('');
    });

    socket.on('round:speedup', ({ remainingSeconds, newDuration }: { remainingSeconds: number; newDuration: number }) => {
      setDuration(newDuration);
      setCountdown(remainingSeconds);
    });

    socket.on('round:reveal', (data: {
      roundNumber: number; results: RevealResult[]; winners: string[]; isDraw: boolean; wins: WinsEntry[]; hearts: HeartsEntry[];
    }) => {
      setCountdown(null);
      setRevealResults(data.results);
      setWinners(data.winners);
      setIsDraw(data.isDraw);
      setWins(data.wins);
      setHearts(data.hearts || []);
      setRetryMessage('');
      setShowWinnerBanner(true);
      const iWon = data.winners.includes(user?.username ?? '') && !data.isDraw;
      haptic(iWon ? [20, 40, 70] : 35);
      sfx.flip();
      // Tulosääni kun kortit ovat kääntyneet
      setTimeout(() => (data.isDraw ? sfx.draw() : iWon ? sfx.win() : sfx.lose()), 550);
      if (!data.isDraw) {
        setStreaks(prev => {
          const next: Record<string, number> = {};
          for (const w of data.winners) next[w] = (prev[w] ?? 0) + 1;
          return next;
        });
      }
    });

    socket.on('room:joinRejected', ({ message }: { message: string }) => setJoinRejected(message));

    socket.on('connect_error', (err: Error) => {
      // Vanhentunut tai virheellinen kirjautuminen: kirjaudutaan ulos, jolloin päädytään kirjautumissivulle
      if (err.message === 'Virheellinen token' || err.message === 'Token puuttuu') logout();
    });

    socket.on('game:over', ({ winner, reason, finalWins }: { winner: string; reason?: 'forfeit'; finalWins: WinsEntry[] }) => {
      setGameOverWinner(winner);
      setFinalWins(finalWins);
      setGameOverReason(reason ?? null);
      setReadyCheckActive(false);
      setCountdown(null);
      if (winner === user?.username) {
        haptic([60, 50, 60, 50, 140]);
        sfx.gameWin();
      }
    });

    socket.on('game:reset', ({ mode, winsRequired }: { mode: GameMode; winsRequired: number }) => {
      setMode(mode);
      setWinsRequired(winsRequired);
      setRoundNumber(null);
      setGameOverWinner(null);
      setRevealResults(null);
      setWins([]);
      setHearts([]);
      setDnfPlayers([]);
      setPickCount(null);
      setCountdown(null);
    });

    socket.on('game:pause', ({ paused, waitingFor }: { paused: boolean; waitingFor: string[] }) => {
      setPaused(paused);
      setWaitingFor(waitingFor);
    });

    socket.on('ready:check', ({ reason, readyNames, total, mode: readyMode, winsRequired: readyWins }: {
      reason: ReadyReason; readyNames: string[]; total: number; mode: GameMode; winsRequired: number;
    }) => {
      setReadyCheckActive(true);
      setReadyReason(reason);
      setReadyNames(readyNames);
      setReadyTotal(total);
      if (readyMode) setMode(readyMode);
      if (readyWins) setWinsRequired(readyWins);
      setGameOverWinner(null);
      if (reason === 'game-start') {
        setStreaks({});
        setRoundNumber(null);
        setWins([]);
        setHearts([]);
        setRevealResults(null);
      }
    });

    socket.on('ready:status', ({ readyNames, total }: { readyNames: string[]; total: number }) => {
      setReadyNames(readyNames);
      setReadyTotal(total);
    });

    socket.on('ready:allReady', () => {
      setReadyCheckActive(false);
      setPausedByName(null);
    });

    socket.on('game:pausedBy', ({ username }: { username: string }) => setPausedByName(username));

    socket.on('error:message', ({ message }: { message: string }) => {
      setError(message);
      setTimeout(() => setError(''), 4000);
    });

    socket.on('connect', joinRoom);
    if (socket.connected) joinRoom();

    return () => {
      socket.off('connect', joinRoom);
      [
        'room:state', 'room:players', 'settings:update', 'round:start', 'round:retry', 'pick:count', 'round:speedup',
        'round:reveal', 'room:joinRejected', 'connect_error', 'game:over', 'game:reset', 'game:pause', 'ready:check',
        'ready:status', 'ready:allReady', 'game:pausedBy', 'round:missed', 'error:message',
      ].forEach(ev => socket.off(ev));
    };
  }, [socket, roomCode, logout, user?.username]);

  useEffect(() => {
    if (paused) return;
    if (countdown === null || countdown <= 0) return;
    const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
    return () => clearTimeout(timer);
  }, [countdown, paused]);

  // Tikitys viimeisillä sekunneilla
  useEffect(() => {
    if (paused || revealResults || countdown === null || countdown < 1 || countdown > 3) return;
    sfx.tick(countdown === 1);
  }, [countdown, paused, revealResults]);

  function toggleMute() {
    setMuted(!muted);
    setMutedState(!muted);
  }

  function handleSettingsChange(next: LobbySettings) {
    setSettings(next);
    socket?.emit('settings:update', { roomCode, settings: next });
  }
  function handleStartGame() {
    setMode(settings.mode);
    setWinsRequired(settings.winsRequired);
    socket?.emit('game:start', { roomCode, ...settings });
  }
  function handlePick(symbol: string) {
    if (hasPicked) return;
    setHasPicked(true);
    setPickedSymbol(symbol);
    haptic(15);
    sfx.pick();
    socket?.emit('pick:submit', { roomCode, symbol });
  }
  function handleReplay() {
    socket?.emit('game:replay', { roomCode, autoStart: true, mode, winsRequired });
  }
  function handleBackToLobby() {
    socket?.emit('game:replay', { roomCode, autoStart: false, mode, winsRequired });
  }
  function handleExit() {
    socket?.emit('room:leave', { roomCode });
    navigate('/lobby');
  }
  function handleReadySubmit() {
    socket?.emit('ready:submit', { roomCode });
  }
  function handlePauseReadyToggle() {
    socket?.emit(iAmReady ? 'ready:cancel' : 'ready:submit', { roomCode });
  }
  function handlePauseToggle() {
    socket?.emit('game:pauseToggle', { roomCode });
  }

  if (joinRejected) {
    return (
      <div className="room-page">
        <div className="room-center">
          <div className="card rejected">
            <div className="rejected-icon" aria-hidden="true">🚪</div>
            <h1>Huoneeseen {roomCode} ei pääse</h1>
            <p className="muted">{joinRejected}</p>
            <button className="btn btn-primary btn-block" onClick={() => navigate('/lobby')}>Takaisin etusivulle</button>
          </div>
        </div>
      </div>
    );
  }

  const inGame = roundNumber !== null || !!gameOverWinner || readyCheckActive;
  const winnerSet = revealResults && !isDraw ? new Set(winners) : new Set<string>();

  const circlePlayers = players.map(p => ({
    userId: p.userId,
    username: p.username,
    avatarEmoji: p.avatarEmoji,
    avatarColor: p.avatarColor,
    avatarImage: p.avatarImage,
    hearts: hearts.find(h => h.username === p.username)?.hearts ?? 3,
    wins: wins.find(w => w.username === p.username)?.wins ?? 0,
    isMe: p.userId === user?.id,
    isBot: p.isBot,
    isConnected: p.isConnected,
    hasPicked: revealResults === null && (pickCount?.pickedNames.includes(p.username) ?? false),
    isDnf: dnfPlayers.includes(p.username),
    isWinner: winnerSet.has(p.username),
    streak: streaks[p.username] ?? 0,
    revealedSymbol: revealResults?.find(r => r.username === p.username)?.symbol ?? null,
  }));


  let explanation: string | null = null;
  if (revealResults && !isDraw && winners.length > 0) {
    const winningSymbol = revealResults.find(r => winners.includes(r.username))?.symbol ?? null;
    const losingSymbols = revealResults.filter(r => !winners.includes(r.username) && r.symbol).map(r => r.symbol!);
    explanation = explainWin(winningSymbol, losingSymbols);
  }

  let statusText: string | null = null;
  let statusKind: 'info' | 'warn' | 'accent' = 'info';
  if (paused) { statusText = `Odotetaan, että ${waitingFor.join(', ')} palaa…`; statusKind = 'warn'; }
  else if (retryMessage) { statusText = retryMessage; statusKind = 'warn'; }
  else if (revealResults) statusText = null;
  else if (iAmDnf) statusText = 'Sydämet loppuivat — katsot tämän kierroksen sivusta';
  else if (hasPicked) { statusText = `Valinta lukittu · ${pickCount?.picked ?? 1}/${pickCount?.total ?? players.length} valmiina`; statusKind = 'accent'; }
  else if (roundNumber !== null && countdown !== null) statusText = 'Valitse käsi ennen kuin aika loppuu';

  const isManualPauseGap = readyCheckActive && readyReason === 'manual-pause';
  const showGameOver = !!gameOverWinner && !readyCheckActive;
  const hostName = players.find(p => p.isHost)?.username ?? null;

  return (
    <div className={`room-page ${inGame ? 'in-game' : 'in-lobby'}`}>
      <header className="room-topbar">
        <button
          className="icon-btn"
          onClick={inGame && !gameOverWinner ? handlePauseToggle : handleExit}
          aria-label={inGame && !gameOverWinner ? 'Valikko' : 'Poistu huoneesta'}
          title={inGame && !gameOverWinner ? 'Valikko' : 'Poistu huoneesta'}
        >
          {inGame && !gameOverWinner ? '❙❙' : '←'}
        </button>
        <div className="room-topbar-center">
          {roundNumber !== null ? (
            <>
              <motion.span
                key={roundNumber}
                className="topbar-round"
                initial={{ scale: 1.4, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: 'spring', stiffness: 400, damping: 18 }}
              >
                Kierros {roundNumber}
              </motion.span>
              <span className="eyebrow">{MODE_LABEL[mode]} · voittoon {winsRequired}</span>
            </>
          ) : (
            <span className="eyebrow">{inGame ? 'Peli alkaa' : 'Odotushuone'}</span>
          )}
        </div>
        <div className="room-topbar-right">
          <button
            className="icon-btn"
            onClick={toggleMute}
            aria-label={muted ? 'Äänet päälle' : 'Mykistä äänet'}
            title={muted ? 'Äänet päälle' : 'Mykistä äänet'}
          >
            {muted ? '🔇' : '🔊'}
          </button>
        </div>
      </header>

      {!connected && <div className="conn-banner">Yhteys katkesi — yhdistetään uudelleen…</div>}
      {error && <div className="alert alert-danger room-alert" role="alert">{error}</div>}

      {!inGame && roomCode && (
        <RoomLobby
          roomCode={roomCode}
          players={players}
          myUserId={user?.id}
          isHost={isHost}
          settings={settings}
          onChange={handleSettingsChange}
          onStart={handleStartGame}
          onAddBot={() => socket?.emit('room:addBot', { roomCode })}
          onRemoveBot={(userId) => socket?.emit('room:removeBot', { roomCode, userId })}
        />
      )}

      {inGame && (
        <main className="game">
          <GameTable
            players={circlePlayers}
            winsRequired={winsRequired}
            countdown={countdown}
            duration={duration}
            paused={paused}
            isRevealPhase={revealResults !== null}
            isDraw={isDraw}
          />

          <div className={`status-line ${statusKind}`} aria-live="polite">{statusText ?? ' '}</div>

          {/* Paljastuksen aikana nappirivin paikalla näytetään kierroksen tulos */}
          <div className="pick-dock">
            {revealResults ? (
              <RoundWinnerBanner
                winners={winners}
                isDraw={isDraw}
                visible={showWinnerBanner}
                myUsername={myName}
                explanation={explanation}
              />
            ) : !iAmDnf && roundNumber !== null && (
              <PickButtons mode={mode} onPick={handlePick} disabled={hasPicked || paused || countdown === null} pickedSymbol={pickedSymbol} />
            )}
          </div>
        </main>
      )}

      <ReadyCheckModal
        visible={readyCheckActive && !isManualPauseGap}
        reason={readyReason}
        pausedByName={pausedByName}
        readyNames={readyNames}
        players={players}
        myUsername={myName}
        mode={mode}
        winsRequired={winsRequired}
        onReady={handleReadySubmit}
      />

      <PauseMenu
        visible={isManualPauseGap}
        iAmReady={iAmReady}
        readyCount={readyNames.length}
        readyTotal={readyTotal}
        pausedByName={pausedByName}
        mode={mode}
        onToggleReady={handlePauseReadyToggle}
        onExit={handleExit}
      />

      <GameOverModal
        winner={showGameOver ? gameOverWinner : null}
        subtitle={gameOverReason === 'forfeit' ? 'Muut pelaajat poistuivat pelistä' : null}
        modeLabel={MODE_LABEL[mode]}
        winsRequired={winsRequired}
        standings={(finalWins ?? wins).map((w, i) => ({
          userId: players.find(p => p.username === w.username)?.userId ?? -100 - i,
          username: w.username,
          wins: w.wins,
        }))}
        myUsername={myName}
        hostName={hostName}
        isHost={isHost}
        onReplay={handleReplay}
        onBackToLobby={handleBackToLobby}
        onExit={handleExit}
      />
    </div>
  );
}
