import { motion, AnimatePresence } from 'framer-motion';

interface RoundWinnerBannerProps {
  winners: string[];
  isDraw: boolean;
  visible: boolean;
  myUsername: string;
  explanation: string | null;
}

export default function RoundWinnerBanner({ winners, isDraw, visible, myUsername, explanation }: RoundWinnerBannerProps) {
  const iWon = winners.includes(myUsername);
  const others = winners.filter(w => w !== myUsername);

  let title: string;
  if (isDraw || winners.length === 0) title = 'Tasapeli';
  else if (iWon && others.length === 0) title = 'Voitit kierroksen';
  else if (iWon) title = `Sinä ja ${others.join(', ')} voititte`;
  else title = `${winners.join(', ')} voitti kierroksen`;

  return (
    <div className="banner-wrap" aria-live="polite">
      <AnimatePresence>
        {visible && (
          <motion.div
            className={`round-banner ${iWon ? 'won' : isDraw ? 'draw' : 'lost'}`}
            initial={{ opacity: 0, y: 20, scale: 0.92 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.96 }}
            transition={{ type: 'spring', stiffness: 360, damping: 26 }}
          >
            <span className="round-banner-title">{title}</span>
            {explanation && !isDraw && <span className="round-banner-sub">{explanation}</span>}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
