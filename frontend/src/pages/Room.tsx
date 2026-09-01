import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../hooks/useSocket';
import { useAutoScale } from '../hooks/useAutoScale';
import PlayerCircle from '../components/PlayerCircle';
import Leaderboard from '../components/Leaderboard';
import PickButtons from '../components/PickButtons';
import '../components/PlayerCircle.css';
import '../components/Leaderboard.css';
import '../components/PickButtons.css';
import './Room.css';

interface Player {
  socketId: string;
  userId: number;
  username: string;
  isHost: boolean;
  isConnected: boolean;
  isBot: boolean;
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

const SYMBOL_LABEL: Record<string, string> = {
  rock: 'Kivi', paper: 'Paperi', scissors: 'Sakset', lizard: 'Lisko', spock: 'Spock',
};

export default function Room() {
  const { roomCode } = useParams();
  const { token, user } = useAuth();
  const { socket, connected } = useSocket(token);
  const navigate = useNavigate();
  const { containerRef, scale } = useAutoScale<HTMLDivElement>(400, 700);

  const [players, setPlayers] = useState<Player[]>([]);
  const [mode, setMode] = useState<'classic' | 'extended'>('classic');
  const [winsRequired, setWinsRequired] = useState(3);
  const [roundNumber, setRoundNumber] = useState<number | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [hasPicked, setHasPicked] = useState(false);
  const [pickCount, setPickCount] = useState<{ picked: number; total: number; pickedNames: string[] } | null>(null);
  const [revealResults, setRevealResults] = useState<RevealResult[] | null>(null);
  const [winners, setWinners] = useState<string[]>([]);
  const [isDraw, setIsDraw] = useState(false);
  const [wins, setWins] = useState<WinsEntry[]>([]);
  const [hearts, setHearts] = useState<HeartsEntry[]>([]);
  const [dnfPlayers, setDnfPlayers] = useState<string[]>([]);
  const [gameOverWinner, setGameOverWinner] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [paused, setPaused] = useState(false);
  const [waitingFor, setWaitingFor] = useState<string[]>([]);
  const [retryMessage, setRetryMessage] = useState('');

  const me = players.find(p => p.userId === user?.id);
  const isHost = me?.isHost || false;
  const iAmDnf = dnfPlayers.includes(user?.username || '');

  useEffect(() => {
    if (!socket || !roomCode) return;

    socket.emit('room:join', { roomCode });

    socket.on('room:players', ({ players }: { players: Player[] }) => setPlayers(players));

    socket.on('round:start', ({ roundNumber, duration, mode, dnf, hearts }: {
      roundNumber: number; duration: number; mode: 'classic' | 'extended'; dnf: string[]; hearts: HeartsEntry[];
    }) => {
      setRoundNumber(roundNumber);
      setMode(mode);
      setHasPicked(false);
      setPickCount(null);
      setRevealResults(null);
      setGameOverWinner(null);
      setCountdown(duration);
      setDnfPlayers(dnf || []);
      setHearts(hearts || []);
      setRetryMessage('');
    });

    socket.on('round:retry', ({ reason }: { reason: string }) => {
      setRetryMessage(reason === 'draw' ? 'Tasapeli — kierros uusitaan!' : 'Joku myöhästyi — kierros uusitaan!');
    });

    socket.on('pick:count', (data: { picked: number; total: number; pickedNames: string[] }) => setPickCount(data));

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
    });

    socket.on('game:over', ({ winner }: { winner: string }) => setGameOverWinner(winner));

    socket.on('game:reset', ({ mode, winsRequired }: { mode: 'classic' | 'extended'; winsRequired: number }) => {
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

    socket.on('error:message', ({ message }: { message: string }) => setError(message));

    return () => {
      socket.off('room:players');
      socket.off('round:start');
      socket.off('round:retry');
      socket.off('pick:count');
      socket.off('round:reveal');
      socket.off('game:over');
      socket.off('game:reset');
      socket.off('game:pause');
      socket.off('error:message');
    };
  }, [socket, roomCode]);

  useEffect(() => {
    if (paused) return;
    if (countdown === null || countdown <= 0) return;
    const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
    return () => clearTimeout(timer);
  }, [countdown, paused]);

  function handleStartGame() {
    socket?.emit('game:start', { roomCode, winsRequired, mode });
  }
  function handlePick(symbol: string) {
    if (hasPicked) return;
    setHasPicked(true);
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

  const circlePlayers = players.map(p => ({
    userId: p.userId,
    username: p.username,
    hearts: hearts.find(h => h.username === p.username)?.hearts ?? 3,
    wins: wins.find(w => w.username === p.username)?.wins ?? 0,
    isBot: p.isBot,
    isConnected: p.isConnected,
    hasPicked: revealResults === null && (pickCount?.pickedNames.includes(p.username) ?? false),
    isDnf: dnfPlayers.includes(p.username),
  }));

  const leaderboardEntries = players.map(p => ({
    userId: p.userId,
    username: p.username,
    wins: wins.find(w => w.username === p.username)?.wins ?? 0,
  }));

  return (
    <div className="room-page-outer">
      <div className="room-page" ref={containerRef} style={{ transform: `scale(${scale})` }}>
        <div className="room-header">
          <span className="room-code-label">{roomCode}</span>
          <span>
            <span className={`connection-dot ${connected ? 'connected' : 'disconnected'}`} />
            {connected ? 'Yhdistetty' : 'Ei yhteyttä'}
          </span>
        </div>

        {error && <div className="error-banner">{error}</div>}

        {(roundNumber !== null || gameOverWinner) && wins.length > 0 && (
          <Leaderboard entries={leaderboardEntries} />
        )}

        {roundNumber === null && !gameOverWinner && (
          isHost ? (
            <div className="setup-panel">
              <div className="setup-row">
                <span>Moodi</span>
                <select value={mode} onChange={(e) => setMode(e.target.value as 'classic' | 'extended')}>
                  <option value="classic">Klassinen</option>
                  <option value="extended">KPSL-Spock</option>
                </select>
              </div>
              <div className="setup-row">
                <span>Voittoja vaadittu</span>
                <input
                  type="number"
                  value={winsRequired}
                  onChange={(e) => setWinsRequired(parseInt(e.target.value) || 1)}
                />
              </div>
              <div className="btn-row">
                <button className="btn btn-primary" onClick={handleStartGame}>Aloita peli</button>
                <button className="btn btn-secondary" onClick={handleExit}>Exit game</button>
              </div>
            </div>
          ) : (
            <div className="setup-panel">
              <p className="round-label">Odotetaan että host aloittaa pelin...</p>
              <button className="btn btn-secondary" onClick={handleExit}>Exit game</button>
            </div>
          )
        )}

        {roundNumber !== null && (
          <>
            <p className="round-label">Kierros {roundNumber}</p>

            {retryMessage && <div className="status-message retry">🔁 {retryMessage}</div>}
            {dnfPlayers.length > 0 && (
              <div className="status-message dnf">Sivussa tällä kierroksella: {dnfPlayers.join(', ')}</div>
            )}
            {paused && (
              <div className="status-message pause">⏸ Odotetaan: {waitingFor.join(', ')}</div>
            )}

            <PlayerCircle players={circlePlayers} countdown={countdown} paused={paused} />

            {!revealResults && !iAmDnf && (
              <PickButtons mode={mode} onPick={handlePick} disabled={hasPicked || paused} hasPicked={hasPicked} />
            )}

            {!revealResults && iAmDnf && (
              <p className="status-message dnf">Ei sydämiä jäljellä — katsot tätä kierrosta sivusta.</p>
            )}

            {pickCount && !revealResults && (
              <p className="round-label">{pickCount.picked} / {pickCount.total} valinnut</p>
            )}

            {revealResults && (
              <div className="reveal-panel">
                <h3 className={`reveal-title ${isDraw ? 'draw' : 'win'}`}>
                  {isDraw ? 'Tasapeli!' : `Voittaja(t): ${winners.join(', ')}`}
                </h3>
                <ul className="reveal-list">
                  {revealResults.map((r, i) => (
                    <li key={i}>
                      {r.username}: {r.dnf ? 'DNF' : (SYMBOL_LABEL[r.symbol || ''] || 'ei valintaa')}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}

        {gameOverWinner && (
          <div className="game-over-panel">
            <h2 className="game-over-title">🏆 {gameOverWinner} voitti pelin!</h2>
            {isHost ? (
              <div className="btn-row">
                <button className="btn btn-primary" onClick={handleReplay}>Pelaa uudestaan</button>
                <button className="btn btn-secondary" onClick={handleBackToLobby}>Takaisin lobbyyn</button>
                <button className="btn btn-secondary" onClick={handleExit}>Exit game</button>
              </div>
            ) : (
              <div className="btn-row">
                <p className="round-label">Odotetaan hostin päätöstä...</p>
                <button className="btn btn-secondary" onClick={handleExit}>Exit game</button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}