import { motion } from 'framer-motion';
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
  hostName: string | null;
  isHost: boolean;
  onReplay: () => void;
  onBackToLobby: () => void;
  onExit: () => void;
}

export default function GameOverModal({
  winner, subtitle, modeLabel, winsRequired, standings, myUsername, hostName, isHost, onReplay, onBackToLobby, onExit,
}: GameOverModalProps) {
  const iWon = winner === myUsername;
  const sorted = [...standings].sort((a, b) => b.wins - a.wins);

  return (
    <Modal open={!!winner} label="Peli päättyi">
      <motion.div
        className={`trophy ${iWon ? 'won' : ''}`}
        initial={{ scale: 0.4, rotate: -20, opacity: 0 }}
        animate={{ scale: 1, rotate: 0, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 260, damping: 14, delay: 0.1 }}
        aria-hidden="true"
      >
        🏆
      </motion.div>
      <h2 className="sheet-title">{iWon ? 'Voitit pelin!' : `${winner} voitti pelin`}</h2>
      <p className="sheet-sub">{subtitle ?? `${modeLabel} · ${winsRequired} ${winsRequired === 1 ? 'voitto' : 'voittoa'} voittaa`}</p>

      <ol className="standings">
        {sorted.map((s, i) => (
          <li key={s.userId} className={s.username === winner ? 'first' : ''}>
            <span className="standing-pos">{i + 1}</span>
            <span className="score-dot" style={{ background: playerColor(s.userId) }} />
            <span className="standing-name">{s.username === myUsername ? `${s.username} (sinä)` : s.username}</span>
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
  );
}
