import { motion, AnimatePresence } from 'framer-motion';

interface PlayerHandProps {
  hasPicked: boolean;
  revealedSymbol: string | null;
  isRevealPhase: boolean;
  isDnf: boolean;
}

const SYMBOL_EMOJI: Record<string, string> = {
  rock: '✊',
  paper: '✋',
  scissors: '✌️',
  lizard: '🦎',
  spock: '🖖',
};

export default function PlayerHand({ hasPicked, revealedSymbol, isRevealPhase, isDnf }: PlayerHandProps) {
  if (isDnf) {
    return (
      <div className="player-hand player-hand-dnf">
        <span>💤</span>
      </div>
    );
  }

  let content: string;
  let key: string;

  if (isRevealPhase) {
    content = revealedSymbol ? SYMBOL_EMOJI[revealedSymbol] || '❓' : '❓';
    key = `reveal-${revealedSymbol}`;
  } else if (hasPicked) {
    content = '✊';
    key = 'locked';
  } else {
    content = '🤚';
    key = 'idle';
  }

  return (
    <div className="player-hand">
      <AnimatePresence mode="wait">
        <motion.span
          key={key}
          initial={{ scale: 0.5, rotate: -15, opacity: 0 }}
          animate={{ scale: 1, rotate: 0, opacity: 1 }}
          exit={{ scale: 0.5, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 400, damping: 18 }}
          className={hasPicked && !isRevealPhase ? 'hand-locked' : ''}
        >
          {content}
        </motion.span>
      </AnimatePresence>
    </div>
  );
}