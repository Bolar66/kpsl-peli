import { motion, AnimatePresence } from 'framer-motion';

interface LeaderboardEntry {
  userId: number;
  username: string;
  wins: number;
}

interface LeaderboardProps {
  entries: LeaderboardEntry[];
}

export default function Leaderboard({ entries }: LeaderboardProps) {
  const sorted = [...entries].sort((a, b) => b.wins - a.wins);

  return (
    <div className="leaderboard">
      <AnimatePresence>
        {sorted.map((entry, i) => (
          <motion.div
            key={entry.userId}
            layout
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            className={`leaderboard-entry ${i === 0 && entry.wins > 0 ? 'leading' : ''}`}
          >
            {i === 0 && entry.wins > 0 && <span className="leaderboard-crown">🏆</span>}
            <span className="leaderboard-name">{entry.username}</span>
            <span className="leaderboard-wins">{entry.wins}</span>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}