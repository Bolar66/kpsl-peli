import { motion } from 'framer-motion';
import { playerColor } from '../constants/players';

interface ScoreEntry {
  userId: number;
  username: string;
  wins: number;
  isMe: boolean;
  color?: string | null;
}

interface ScoreboardProps {
  entries: ScoreEntry[];
  winsRequired: number;
}

// Pistetilanne: jokaiselle pelaajalle palkki "voittoja / tarvitaan"
export default function Scoreboard({ entries, winsRequired }: ScoreboardProps) {
  const maxWins = Math.max(0, ...entries.map(e => e.wins));

  return (
    <div className="scoreboard">
      {entries.map(e => {
        const leading = e.wins > 0 && e.wins === maxWins;
        return (
          <div key={e.userId} className={`score ${e.isMe ? 'me' : ''} ${leading ? 'leading' : ''}`}>
            <div className="score-top">
              <span className="score-name">
                <span className="score-dot" style={{ background: e.color || playerColor(e.userId) }} />
                {e.username}
              </span>
              <motion.span key={e.wins} className="score-num" initial={{ scale: 1.5 }} animate={{ scale: 1 }}>
                {e.wins}<span className="faint">/{winsRequired}</span>
              </motion.span>
            </div>
            <div className="score-bar">
              <motion.div
                className="score-fill"
                initial={false}
                animate={{ width: `${Math.min(e.wins / winsRequired, 1) * 100}%` }}
                transition={{ type: 'spring', stiffness: 200, damping: 26 }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
