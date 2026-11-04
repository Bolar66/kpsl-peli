import { motion } from 'framer-motion';
import { useRef } from 'react';
import Modal from './Modal';
import { playerColor } from '../constants/players';

interface Standing {
  userId: number;
  username: string;
  wins: number;
}

interface GameOverModalProps {
  winner: string | null;
  subtitle?: string | null;
  modeLabel: string;
  winsRequired: number;
  standings: Standing[];
  myUsername: string;
  matchWins: Record<number, number>;
  hostName: string | null;
  isHost: boolean;
  onReplay: () => void;
  onBackToLobby: () => void;
  onExit: () => void;
  // Piilotettu yllätys: voittaja napauttaa pokaalia kolme kertaa
  onSecret: () => void;
  secretActive: boolean;
}

// Konfetti arvotaan kerran, jotta uudelleenpiirto ei muuta animaatiota
const CONFETTI_COLORS = ['#D4FF3A', '#7DD3FC', '#F9A8D4', '#FDBA74', '#C4B5FD'];
const CONFETTI = Array.from({ length: 36 }, (_, i) => ({
  left: Math.random() * 100,
  delay: Math.random() * 0.6,
  duration: 1.8 + Math.random() * 1.4,
  drift: (Math.random() - 0.5) * 120,
  rotate: (Math.random() - 0.5) * 720,
  color: CONFETTI_COLORS[i % CONFETTI_COLORS.length]!,
  wide: Math.random() > 0.5,
}));

function Confetti() {
  return (
    <div className="confetti" aria-hidden="true">
      {CONFETTI.map((c, i) => (
        <motion.span
          key={i}
          style={{ left: `${c.left}%`, background: c.color, width: c.wide ? 10 : 6, height: c.wide ? 6 : 10 }}
          initial={{ y: -20, x: 0, rotate: 0, opacity: 1 }}
          animate={{ y: '105vh', x: c.drift, rotate: c.rotate, opacity: [1, 1, 0.8] }}
          transition={{ duration: c.duration, delay: c.delay, ease: [0.25, 0.4, 0.6, 1] }}
        />
      ))}
    </div>
  );
}

export default function GameOverModal({
  winner, subtitle, modeLabel, winsRequired, standings, myUsername, matchWins, hostName, isHost, onReplay, onBackToLobby, onExit,
  onSecret, secretActive,
}: GameOverModalProps) {
  const iWon = winner === myUsername;
  const taps = useRef<number[]>([]);

  function handleTrophyTap() {
    if (!iWon) return;
    const now = Date.now();
    taps.current = [...taps.current.filter(t => now - t < 1500), now];
    if (taps.current.length >= 3) {
      taps.current = [];
      onSecret();
    }
  }
  const sorted = [...standings].sort((a, b) => b.wins - a.wins);

  return (
    <>
    {/* Konfetti ikkunan ulkopuolella, jotta se sataa koko näytölle */}
    {iWon && !secretActive && <Confetti />}
    <Modal open={!!winner} label="Peli päättyi">
      <motion.div
        className={`trophy ${iWon ? 'won' : ''} ${secretActive ? 'lit' : ''}`}
        onClick={handleTrophyTap}
        initial={{ scale: 0.4, rotate: -20, opacity: 0 }}
        animate={{ scale: 1, rotate: 0, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 260, damping: 14, delay: 0.1 }}
        aria-hidden="true"
        key={secretActive ? 'lit' : 'trophy'}
      >
        {secretActive ? '🔥' : '🏆'}
      </motion.div>
      <h2 className="sheet-title">{iWon ? 'Voitit pelin!' : `${winner} voitti pelin`}</h2>
      <p className="sheet-sub">{subtitle ?? `${modeLabel} · ${winsRequired} ${winsRequired === 1 ? 'voitto' : 'voittoa'} voittaa`}</p>

      <ol className="standings">
        {sorted.map((s, i) => (
          <li key={s.userId} className={s.username === winner ? 'first' : ''}>
            <span className="standing-pos">{i + 1}</span>
            <span className="score-dot" style={{ background: playerColor(s.userId) }} />
            <span className="standing-name">{s.username === myUsername ? `${s.username} (sinä)` : s.username}</span>
            {(matchWins[s.userId] ?? 0) > 0 && (
              <span className="standing-match" title="Voitetut pelit tässä huoneessa">👑 {matchWins[s.userId]}</span>
            )}
            <span className="standing-wins">{s.wins}</span>
          </li>
        ))}
      </ol>

      {isHost ? (
        <div className="sheet-actions">
          <button className="btn btn-primary btn-block" onClick={onReplay}>Pelaa uudestaan</button>
          <button className="btn btn-secondary btn-block" onClick={onBackToLobby}>Muuta asetuksia</button>
          <button className="btn btn-ghost btn-block" onClick={onExit}>Poistu huoneesta</button>
        </div>
      ) : (
        <div className="sheet-actions">
          <p className="waiting-host"><span className="dot-pulse" /> Odotetaan, että {hostName ?? 'host'} aloittaa uuden pelin</p>
          <button className="btn btn-ghost btn-block" onClick={onExit}>Poistu huoneesta</button>
        </div>
      )}
    </Modal>
    </>
  );
}
