import { motion } from 'framer-motion';

// Piilotetun yllätyksen efekti: savukiehkurat nousevat ja leijuvat ruudun yli, ruutu sumenee
// vihertäväksi ja lehtiä leijailee alas. Arvot arvotaan kerran, jotta uudelleenpiirto ei muuta niitä.
const PUFFS = Array.from({ length: 16 }, (_, i) => ({
  startX: 42 + (Math.random() - 0.5) * 16,
  driftX: (Math.random() - 0.5) * 70,
  rise: 55 + Math.random() * 35,
  size: 90 + Math.random() * 140,
  delay: 0.9 + i * 0.22 + Math.random() * 0.2,
  duration: 4.5 + Math.random() * 2,
}));

const LEAVES = Array.from({ length: 22 }, () => ({
  left: Math.random() * 100,
  delay: 1.2 + Math.random() * 3,
  duration: 4 + Math.random() * 3,
  sway: (Math.random() - 0.5) * 140,
  spin: (Math.random() - 0.5) * 540,
  size: 16 + Math.random() * 14,
}));

export const SMOKE_DURATION_MS = 8000;

export default function SmokeEffect() {
  return (
    <div className="smoke-layer" aria-hidden="true">
      <motion.div
        className="smoke-haze"
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 1, 1, 0] }}
        transition={{ duration: SMOKE_DURATION_MS / 1000, times: [0, 0.2, 0.75, 1], ease: 'easeInOut' }}
      />
      {PUFFS.map((p, i) => (
        <motion.span
          key={`p${i}`}
          className="smoke-puff"
          style={{ left: `${p.startX}%`, width: p.size, height: p.size }}
          initial={{ y: '78vh', x: 0, opacity: 0, scale: 0.3 }}
          animate={{ y: `${78 - p.rise}vh`, x: p.driftX, opacity: [0, 0.55, 0.35, 0], scale: 1.6 }}
          transition={{ duration: p.duration, delay: p.delay, ease: [0.2, 0.6, 0.4, 1] }}
        />
      ))}
      {LEAVES.map((l, i) => (
        <motion.span
          key={`l${i}`}
          className="smoke-leaf"
          style={{ left: `${l.left}%`, fontSize: l.size }}
          initial={{ y: '-8vh', x: 0, rotate: 0, opacity: 0 }}
          animate={{ y: '108vh', x: l.sway, rotate: l.spin, opacity: [0, 1, 1, 0] }}
          transition={{ duration: l.duration, delay: l.delay, ease: 'linear' }}
        >
          🍃
        </motion.span>
      ))}
    </div>
  );
}
