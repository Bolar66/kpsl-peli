import { motion, AnimatePresence } from 'framer-motion';

interface CountdownRingProps {
  countdown: number;
  duration: number;
}

const SIZE = 88;
const STROKE = 3;
const RADIUS = (SIZE - STROKE) / 2 - 2;

export default function CountdownRing({ countdown, duration }: CountdownRingProps) {
  const fraction = Math.max(Math.min(countdown / duration, 1), 0);
  const circumference = 2 * Math.PI * RADIUS;
  const urgent = countdown <= 2;
  const color = urgent ? 'var(--danger)' : 'var(--accent)';

  return (
    <div className={`countdown ${urgent ? 'urgent' : ''}`}>
      <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} aria-hidden="true">
        <circle cx={SIZE / 2} cy={SIZE / 2} r={RADIUS} fill="none" stroke="var(--border)" strokeWidth={STROKE} />
        <circle
          cx={SIZE / 2} cy={SIZE / 2} r={RADIUS}
          fill="none" stroke={color} strokeWidth={STROKE}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - fraction)}
          transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
          style={{ transition: 'stroke-dashoffset 1s linear, stroke 0.3s ease' }}
        />
      </svg>
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={countdown}
          className="countdown-num"
          style={{ color }}
          initial={{ opacity: 0, scale: 1.4 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.7 }}
          transition={{ duration: 0.25, ease: [0.2, 0.8, 0.2, 1] }}
          aria-live="polite"
        >
          {countdown}
        </motion.span>
      </AnimatePresence>
    </div>
  );
}
