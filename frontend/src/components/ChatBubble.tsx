import { motion, AnimatePresence } from 'framer-motion';

export interface BubbleData {
  id: number;
  text: string;
  emote: boolean;
}

type Side = 'left' | 'right' | 'up' | 'up-start' | 'up-end';

// Emotesta lentävät pienet kopiot: suunnat kiinteästi, jotta uudelleenpiirto ei muuta animaatiota
const FLOATERS = [
  { x: -26, y: -46, rotate: -25, delay: 0.1 },
  { x: 4, y: -62, rotate: 10, delay: 0.22 },
  { x: 28, y: -44, rotate: 28, delay: 0.32 },
  { x: -10, y: -36, rotate: -8, delay: 0.45 },
];

function EmoteBurst({ text }: { text: string }) {
  return (
    <>
      <span className="emote-ring" aria-hidden="true" />
      {FLOATERS.map((f, i) => (
        <motion.span
          key={i}
          className="emote-floater"
          aria-hidden="true"
          initial={{ x: 0, y: 0, opacity: 0, scale: 0.3, rotate: 0 }}
          animate={{ x: f.x, y: f.y, opacity: [0, 1, 0], scale: 0.55, rotate: f.rotate }}
          transition={{ duration: 1.1, delay: f.delay, ease: 'easeOut' }}
        >
          {text}
        </motion.span>
      ))}
    </>
  );
}

// Puhekupla profiilikuvan vieressä. Suunta valitaan niin, että kupla aukeaa näytön keskustaa kohti.
// Emotet näytetään isona ilman kuplaa: ne pomppaavat esiin heilahtaen ja niistä lentää pieniä kopioita.
export default function ChatBubble({ bubble, side }: { bubble: BubbleData | null; side: Side }) {
  return (
    <AnimatePresence>
      {bubble && (
        <motion.span
          key={bubble.id}
          className={`chat-bubble ${side} ${bubble.emote ? 'emote' : ''}`}
          initial={bubble.emote ? { opacity: 0, scale: 0.2, rotate: -30 } : { opacity: 0, scale: 0.4 }}
          animate={bubble.emote
            ? { opacity: 1, scale: [0.2, 1.35, 1], rotate: [-30, 12, -6, 0] }
            : { opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.7 }}
          transition={bubble.emote
            ? { duration: 0.6, ease: [0.2, 0.9, 0.3, 1.2] }
            : { type: 'spring', stiffness: 520, damping: 22 }}
          role="status"
        >
          {bubble.emote && <EmoteBurst text={bubble.text} />}
          <span className="chat-bubble-text">{bubble.text}</span>
        </motion.span>
      )}
    </AnimatePresence>
  );
}
