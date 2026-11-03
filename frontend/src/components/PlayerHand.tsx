import { motion, AnimatePresence } from 'framer-motion';
import { SYMBOL_INFO } from '../constants/symbols';

interface PlayerHandProps {
  hasPicked: boolean;
  revealedSymbol: string | null;
  isRevealPhase: boolean;
  isDnf: boolean;
  isWinner: boolean;
}

export default function PlayerHand({ hasPicked, revealedSymbol, isRevealPhase, isDnf, isWinner }: PlayerHandProps) {
  let content: string;
  let key: string;
  let className = 'hand';

  if (isDnf) {
    content = '💤';
    key = 'dnf';
    className += ' hand-dnf';
  } else if (isRevealPhase) {
    content = revealedSymbol ? SYMBOL_INFO[revealedSymbol]?.emoji ?? '❓' : '❓';
    key = `reveal-${revealedSymbol}`;
    className += isWinner ? ' hand-win' : ' hand-revealed';
  } else if (hasPicked) {
    content = '✊';
    key = 'locked';
    className += ' hand-locked';
  } else {
    content = '🤚';
    key = 'idle';
    className += ' hand-idle';
  }

  return (
    <div className="hand-slot">
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={key}
          className={className}
          initial={isRevealPhase ? { rotateY: 90, scale: 0.6, opacity: 0 } : { scale: 0.6, opacity: 0 }}
          animate={{ rotateY: 0, scale: isWinner ? 1.15 : 1, opacity: 1 }}
          exit={{ scale: 0.6, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 380, damping: 20 }}
        >
          {content}
        </motion.span>
      </AnimatePresence>
    </div>
  );
}
