import { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface CountdownRingProps {
  // Kokonaisina sekunteina näytettävä luku (päivittyy Room-sivulta)
  countdown: number;
  // Kierroksen loppuhetki (Date.now()-aikaa) ja kierroksen alkuperäinen pituus — rengas piirretään näistä
  endsAt: number | null;
  totalMs: number;
}

const SIZE = 88;
const CHANT: Record<number, string> = { 3: 'Kivi', 2: 'Paperi', 1: 'Sakset!', 0: 'Nyt!' };
const STROKE = 3;
const RADIUS = (SIZE - STROKE) / 2 - 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export default function CountdownRing({ countdown, endsAt, totalMs }: CountdownRingProps) {
  const arcRef = useRef<SVGCircleElement>(null);
  const shown = useRef(1);
  const urgent = countdown <= 3;
  // Viimeiset sekunnit huudetaan kuin oikeassa pelissä: kivi… paperi… sakset!
  const chant = CHANT[countdown];
  const color = urgent ? 'var(--danger)' : 'var(--accent-line)';

  // Rengas päivitetään joka ruudunpäivityksellä suoraan DOMiin. Kun aika lyhenee yhtäkkiä
  // (kaikki valitsivat), rengas liukuu pehmeästi uuteen kohtaan eikä hyppää.
  useEffect(() => {
    let frame = 0;
    let last = performance.now();
    const draw = (now: number) => {
      const dt = now - last;
      last = now;
      const target = endsAt === null ? shown.current : Math.max(0, Math.min(1, (endsAt - Date.now()) / totalMs));
      shown.current += (target - shown.current) * (1 - Math.exp(-dt / 90));
      arcRef.current?.setAttribute('stroke-dashoffset', String(CIRCUMFERENCE * (1 - shown.current)));
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [endsAt, totalMs]);

  return (
    <div className={`countdown ${urgent ? 'urgent' : ''}`}>
      <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} aria-hidden="true">
        <circle cx={SIZE / 2} cy={SIZE / 2} r={RADIUS} fill="none" stroke="var(--border)" strokeWidth={STROKE} />
        <circle
          ref={arcRef}
          cx={SIZE / 2} cy={SIZE / 2} r={RADIUS}
          fill="none" stroke={color} strokeWidth={STROKE}
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
          style={{ transition: 'stroke 0.3s ease' }}
        />
      </svg>
      <AnimatePresence initial={false}>
        <motion.span
          key={countdown}
          className={`countdown-num ${chant ? 'chant' : ''}`}
          style={{ color }}
          initial={{ opacity: 0, scale: 1.5 }}
          animate={{ opacity: 1, scale: 1, transition: { duration: 0.3, ease: [0.2, 0.8, 0.2, 1] } }}
          exit={{ opacity: 0, scale: 0.6, transition: { duration: 0.1 } }}
          aria-live="polite"
        >
          {chant ?? countdown}
        </motion.span>
      </AnimatePresence>
    </div>
  );
}
