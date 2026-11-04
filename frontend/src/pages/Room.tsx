import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { inviteFriend } from '../api/friends';
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
import { crowdFx, sfx } from '../constants/sound';
import { setMusic, setMusicHazy } from '../constants/music';
import SmokeEffect, { SMOKE_DURATION_MS } from '../components/SmokeEffect';
import { duckMusic, setMusicMuffled } from '../constants/audioEngine';
import AudioSettingsSheet from '../components/AudioSettings';
import ChatSheet from '../components/ChatSheet';
import { BUBBLE_MS, EMOTE_BUBBLE_MS, isBigEmoji, type ChatMessage } from '../constants/chat';
import type { BubbleData } from '../components/ChatBubble';
import { useAudioSettings } from '../hooks/useAudioSettings';
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
  const location = useLocation();
  // Kaverilistan "Kutsu peliin" luo huoneen ja välittää kutsuttavan tänne
  const inviteFriendId = (location.state as { inviteFriendId?: number } | null)?.inviteFriendId;

  const [players, setPlayers] = useState<Player[]>([]);
  const [settings, setSettings] = useState<LobbySettings>(DEFAULT_SETTINGS);
  const [mode, setMode] = useState<GameMode>('classic');
  const [winsRequired, setWinsRequired] = useState(3);
  const [roundNumber, setRoundNumber] = useState<number | null>(null);
  // Ajastin: kierroksen loppuhetki ja alkuperäinen pituus; sekuntilukema lasketaan näistä
  const [endsAt, setEndsAt] = useState<number | null>(null);
  const [totalMs, setTotalMs] = useState(10000);
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
  // Peli on käynnissä pelin aloituksesta sen loppuun asti — myös valmiustarkistuksen ja
  // ensimmäisen kierroksen välisen hetken, jottei odotushuone ja valikkomusiikki välähdä välissä
  const [gameActive, setGameActive] = useState(false);
  const [readyReason, setReadyReason] = useState<ReadyReason | null>(null);
  const [pausedByName, setPausedByName] = useState<string | null>(null);
  const [readyNames, setReadyNames] = useState<string[]>([]);
  const [readyTotal, setReadyTotal] = useState(0);

  const [showWinnerBanner, setShowWinnerBanner] = useState(false);
  const audioSettings = useAudioSettings();
  const [audioOpen, setAudioOpen] = useState(false);
  // Chat: viestihistoria, profiilikuvien vieressä näkyvät kuplat ja lukemattomat viestit
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [bubbles, setBubbles] = useState<Record<number, BubbleData>>({});
  const [chatOpen, setChatOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  // Luetaan socket-käsittelijässä, joten pidetään ajan tasalla refissä
  const chatOpenRef = useRef(false);
  useEffect(() => { chatOpenRef.current = chatOpen; }, [chatOpen]);
  // Voittoputket: montako kierrosta peräkkäin kukin on voittanut
  const [streaks, setStreaks] = useState<Record<string, number>>({});
  // Oma voittoputki katsomon reaktioita varten (ref, koska sitä luetaan tapahtumankäsittelijässä)
  const myStreak = useRef(0);
  // Kokonaisten pelien voitot tässä huoneessa (uusinnat yhteen laskettuna), avaimena pelaajan id
  const [matchWins, setMatchWins] = useState<Record<number, number>>({});
  // Piilotettu yllätys: onko efekti käynnissä ja ketkä ovat sen laukaisseet tässä huoneessa (🍃)
  const [smokeActive, setSmokeActive] = useState(false);
  const [leafWinners, setLeafWinners] = useState<Set<number>>(new Set());

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
      remainingMs: number | null;
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
      matchWins: { userId: number; wins: number }[];
      chat: ChatMessage[];
    }) => {
      setChat(state.chat ?? []);
      setMatchWins(Object.fromEntries((state.matchWins ?? []).map(m => [m.userId, m.wins])));
      setMode(state.mode);
      setWinsRequired(state.winsRequired);
      if (state.settings) setSettings(state.settings);
      setRoundNumber(state.roundNumber);
      if (state.duration !== null) setTotalMs(state.duration * 1000);
      setEndsAt(state.remainingMs !== null ? Date.now() + state.remainingMs : null);
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
      setGameActive(state.roundNumber !== null || state.ready !== null || !!state.gameOverWinner);
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
      setGameActive(true);
      setRoundNumber(roundNumber);
      setMode(mode);
      setHasPicked(false);
      setPickedSymbol(null);
      setPickCount(null);
      setRevealResults(null);
      setGameOverWinner(null);
      setTotalMs(roundDuration * 1000);
      setEndsAt(Date.now() + roundDuration * 1000);
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

    // Kaikki valitsivat: aika lyhenee, mutta renkaan mittakaava pysyy samana (rengas liukuu uuteen kohtaan)
    socket.on('round:speedup', ({ remainingSeconds, newDuration }: { remainingSeconds: number; newDuration: number }) => {
      setEndsAt(Date.now() + newDuration * 1000);
      setCountdown(remainingSeconds);
    });

    socket.on('round:reveal', (data: {
      roundNumber: number; results: RevealResult[]; winners: string[]; isDraw: boolean; wins: WinsEntry[]; hearts: HeartsEntry[];
    }) => {
      setCountdown(null);
      setEndsAt(null);
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
      // Musiikki väistää paljastuksen ja katsomon ajaksi
      duckMusic(0.4, 2.4);
      // Tulosääni kun kortit ovat kääntyneet
      if (!data.isDraw) myStreak.current = iWon ? myStreak.current + 1 : 0;
      const streakNow = myStreak.current;
      setTimeout(() => {
        if (data.isDraw) sfx.draw();
        else if (iWon) { sfx.win(); crowdFx.roundWin(streakNow); }
        else { sfx.lose(); crowdFx.otherWin(); }
      }, 550);
      if (!data.isDraw) {
        setStreaks(prev => {
          const next: Record<string, number> = {};
          for (const w of data.winners) next[w] = (prev[w] ?? 0) + 1;
          return next;
        });
      }
    });

    socket.on('easter:light', ({ userId }: { userId: number; username: string }) => {
      setSmokeActive(true);
      setLeafWinners(prev => new Set(prev).add(userId));
      sfx.lighter();
      setTimeout(() => sfx.exhale(), 1100);
      setMusicHazy(true);
      haptic([30, 60, 30]);
      setTimeout(() => {
        setSmokeActive(false);
        setMusicHazy(false);
      }, SMOKE_DURATION_MS);
    });

    socket.on('chat:message', (m: ChatMessage) => {
      setChat(prev => [...prev.slice(-29), m]);
      setBubbles(prev => ({ ...prev, [m.userId]: { id: m.id, text: m.text, emote: isBigEmoji(m) } }));
      // Kupla häviää hetken päästä, ellei samalta pelaajalta tullut sillä välin uutta viestiä
      setTimeout(() => setBubbles(prev => {
        if (prev[m.userId]?.id !== m.id) return prev;
        const next = { ...prev };
        delete next[m.userId];
        return next;
      }), isBigEmoji(m) ? EMOTE_BUBBLE_MS : BUBBLE_MS);
      if (m.userId !== user?.id) {
        sfx.chat();
        if (!chatOpenRef.current && !m.emote) setUnread(n => n + 1);
      }
    });

    socket.on('chat:slowdown', () => {
      setError('Hidasta vähän — liian monta viestiä lyhyessä ajassa');
      setTimeout(() => setError(''), 2500);
    });

    socket.on('room:joinRejected', ({ message }: { message: string }) => setJoinRejected(message));

    socket.on('connect_error', (err: Error) => {
      // Vanhentunut tai virheellinen kirjautuminen: kirjaudutaan ulos, jolloin päädytään kirjautumissivulle
      if (err.message === 'Virheellinen token' || err.message === 'Token puuttuu') logout();
    });

    socket.on('game:over', ({ winner, reason, finalWins, matchWins: mw }: {
      winner: string; reason?: 'forfeit'; finalWins: WinsEntry[]; matchWins: { userId: number; wins: number }[];
    }) => {
      setMatchWins(Object.fromEntries((mw ?? []).map(m => [m.userId, m.wins])));
      setGameOverWinner(winner);
      setFinalWins(finalWins);
      setGameOverReason(reason ?? null);
      setReadyCheckActive(false);
      setCountdown(null);
      if (winner === user?.username) {
        haptic([60, 50, 60, 50, 140]);
        sfx.gameWin();
        duckMusic(0.2, 5.5);
        setTimeout(() => crowdFx.gameWin(), 900);
      } else {
        duckMusic(0.35, 3.5);
        setTimeout(() => crowdFx.gameLose(), 900);
      }
    });

    socket.on('game:reset', ({ mode, winsRequired }: { mode: GameMode; winsRequired: number }) => {
      setMode(mode);
      setWinsRequired(winsRequired);
      setRoundNumber(null);
      setGameActive(false);
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
      setGameActive(true);
      setReadyReason(reason);
      setEndsAt(null);
      setReadyNames(readyNames);
      setReadyTotal(total);
      if (readyMode) setMode(readyMode);
      if (readyWins) setWinsRequired(readyWins);
      setGameOverWinner(null);
      if (reason === 'game-start') {
        setStreaks({});
        myStreak.current = 0;
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
        'ready:status', 'ready:allReady', 'game:pausedBy', 'round:missed', 'error:message', 'easter:light', 'chat:message', 'chat:slowdown',
      ].forEach(ev => socket.off(ev));
    };
  }, [socket, roomCode, logout, user?.username, user?.id]);

  // Sekuntilukema lasketaan loppuhetkestä, joten se ei ajelehdi palvelimen ajastimesta
  useEffect(() => {
    if (paused || endsAt === null) return;
    const id = setInterval(() => setCountdown(Math.max(0, Math.ceil((endsAt - Date.now()) / 1000))), 100);
    return () => clearInterval(id);
  }, [endsAt, paused]);

  // Pelin aikana soi intensiivisempi kappale, odotushuoneessa ja pelin lopussa valikkomusiikki
  const musicInGame = gameActive && !gameOverWinner;
  useEffect(() => {
    setMusic(musicInGame ? 'game' : 'menu');
  }, [musicInGame]);

  // Tauolla musiikki vaimenee
  const musicMuffled = paused || (readyCheckActive && readyReason === 'manual-pause');
  useEffect(() => {
    setMusicMuffled(musicMuffled);
    return () => setMusicMuffled(false);
  }, [musicMuffled]);

  // Tikitys viimeisillä sekunneilla
  useEffect(() => {
    if (paused || revealResults || countdown === null || countdown < 1 || countdown > 3) return;
    sfx.tick(countdown === 1);
  }, [countdown, paused, revealResults]);



  // Kutsu lähetetään vasta kun olet itse huoneessa (palvelin tarkistaa sen). Tila tyhjennetään heti,
  // ettei kutsua lähetetä uudelleen esim. sivun päivityksessä.
  const amInRoom = players.some(p => p.userId === user?.id);
  useEffect(() => {
    if (!inviteFriendId || !amInRoom || !token || !roomCode) return;
    navigate(location.pathname, { replace: true, state: null });
    inviteFriend(token, inviteFriendId, roomCode).catch(err => console.warn('Kutsu epäonnistui', err));
  }, [inviteFriendId, amInRoom, token, roomCode, navigate, location.pathname]);

  function sendChat(message: { text?: string; emote?: string }) {
    socket?.emit('chat:send', { roomCode, ...message });
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
    navigate('/kpsl');
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
            <button className="btn btn-primary btn-block" onClick={() => navigate('/kpsl')}>Takaisin etusivulle</button>
          </div>
        </div>
      </div>
    );
  }

  const inGame = gameActive || roundNumber !== null || !!gameOverWinner || readyCheckActive;
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
    matchWins: matchWins[p.userId] ?? 0,
    leaf: leafWinners.has(p.userId),
    bubble: bubbles[p.userId] ?? null,
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
            className="icon-btn chat-btn"
            onClick={() => { setChatOpen(true); setUnread(0); }}
            aria-label={unread ? `Chat ja emotet, ${unread} uutta viestiä` : 'Chat ja emotet'}
            title="Chat ja emotet"
          >
            😀
            {unread > 0 && <span className="unread">{unread > 9 ? '9+' : unread}</span>}
          </button>
          <button
            className="icon-btn"
            onClick={() => setAudioOpen(true)}
            aria-label="Äänet"
            title="Äänet"
          >
            {audioSettings.muted ? '🔇' : '🔊'}
          </button>
        </div>
      </header>

      {!connected && <div className="conn-banner">Yhteys katkesi — yhdistetään uudelleen…</div>}
      {error && <div className="alert alert-danger room-alert" role="alert">{error}</div>}

      {!inGame && roomCode && (
        <RoomLobby
          roomCode={roomCode}
          players={players}
          matchWins={matchWins}
          bubbles={bubbles}
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
            endsAt={paused ? null : endsAt}
            totalMs={totalMs}
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
        // Äänisäätöjen ollessa auki taukovalikko piilotetaan, jotta säätimet ovat päällimmäisenä
        visible={isManualPauseGap && !audioOpen && !chatOpen}
        iAmReady={iAmReady}
        readyCount={readyNames.length}
        readyTotal={readyTotal}
        pausedByName={pausedByName}
        mode={mode}
        onToggleReady={handlePauseReadyToggle}
        onOpenAudio={() => setAudioOpen(true)}
        onOpenChat={() => { setChatOpen(true); setUnread(0); }}
        unread={unread}
        lastMessage={chat.length ? { name: chat[chat.length - 1]!.userId === user?.id ? 'Sinä' : chat[chat.length - 1]!.username, text: chat[chat.length - 1]!.text } : null}
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
        matchWins={matchWins}
        hostName={hostName}
        isHost={isHost}
        onReplay={handleReplay}
        onBackToLobby={handleBackToLobby}
        onExit={handleExit}
        onSecret={() => socket?.emit('easter:light', { roomCode })}
        secretActive={smokeActive}
      />
      {smokeActive && <SmokeEffect />}
      <AudioSettingsSheet open={audioOpen} onClose={() => setAudioOpen(false)} />
      <ChatSheet
        open={chatOpen}
        messages={chat}
        myUserId={user?.id}
        onSend={sendChat}
        onClose={() => { setChatOpen(false); setUnread(0); }}
      />
    </div>
  );
}
