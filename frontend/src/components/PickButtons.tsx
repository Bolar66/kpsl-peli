import { motion } from 'framer-motion';
import { SYMBOL_INFO, SYMBOLS_BY_MODE, type GameMode } from '../constants/symbols';

interface PickButtonsProps {
  mode: GameMode;
  onPick: (symbol: string) => void;
  disabled: boolean;
  pickedSymbol: string | null;
}

export default function PickButtons({ mode, onPick, disabled, pickedSymbol }: PickButtonsProps) {
  const symbols = SYMBOLS_BY_MODE[mode];

  return (
    <div className={`picks picks-${symbols.length}`} role="group" aria-label="Valitse käsi">
      {symbols.map((symbol, i) => {
        const info = SYMBOL_INFO[symbol]!;
        const isPicked = pickedSymbol === symbol;
        const state = isPicked ? 'picked' : pickedSymbol ? 'dimmed' : disabled ? 'inactive' : '';
        return (
          <motion.button
            key={symbol}
            className={`pick ${state}`}
            onClick={() => onPick(symbol)}
            disabled={disabled}
            aria-pressed={isPicked}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.04, duration: 0.25, ease: [0.2, 0.8, 0.2, 1] }}
            whileTap={disabled ? undefined : { scale: 0.92 }}
          >
            <span className="pick-emoji">{info.emoji}</span>
            <span className="pick-label">{info.label}</span>
          </motion.button>
        );
      })}
    </div>
  );
}
