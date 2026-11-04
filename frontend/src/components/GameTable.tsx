import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Avatar, { type AvatarData } from './Avatar';
import CountdownRing from './CountdownRing';
import { computeLayout } from './tableLayout';
import ChatBubble, { type BubbleData } from './ChatBubble';
import { SYMBOL_INFO } from '../constants/symbols';

export interface TablePlayer extends AvatarData {
  hearts: number;
  wins: number;
  isMe: boolean;
  isBot: boolean;
  isConnected: boolean;
  hasPicked: boolean;
  isDnf: boolean;
  isWinner: boolean;
  revealedSymbol: string | null;
  streak: number;
  matchWins: number;
  leaf: boolean;
  bubble: BubbleData | null;
}

interface GameTableProps {
  players: TablePlayer[];
  winsRequired: number;
  countdown: number | null;
  endsAt: number | null;
  totalMs: number;
  paused: boolean;
  isRevealPhase: boolean;
  isDraw: boolean;
}

const MAX_HEARTS = 3;

// Seurataan kentän kokoa, jotta asettelu päivittyy esim. puhelinta käännettäessä
function useElementSize<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry!.contentRect;
      setSize({ w: Math.round(width), h: Math.round(height) });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return { ref, ...size };
}

// Avatarin ympärillä oleva rengas: yksi lohko per tarvittava voitto, voitetut lohkot täytettyinä
function WinsRing({ wins, required, size }: { wins: number; required: number; size: number }) {
  const r = size / 2 - 2;
  const c = 2 * Math.PI * r;
  const gap = required > 1 ? Math.min(6, c / required / 3) : 0;
  const seg = c / required - gap;
  return (
    <svg className="wins-ring" width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
      {Array.from({ length: required }).map((_, i) => (
        <circle
          key={i}
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={3}
          strokeLinecap="round"
          className={i < wins ? 'won' : ''}
          strokeDasharray={`${seg} ${c - seg}`}
          strokeDashoffset={-(i * (seg + gap)) + c / 4}
        />
      ))}
    </svg>
  );
}

// Voittajan kortista sinkoavat kipinät. Suunnat ja etäisyydet arvotaan kerran, jotta
// uudelleenpiirto ei muuta animaation kohdetta kesken kaiken.
const SPARKS = Array.from({ length: 12 }, (_, i) => {
  const angle = (i / 12) * Math.PI * 2 + Math.random() * 0.4;
  const dist = 38 + Math.random() * 26;
  return { x: Math.cos(angle) * dist, y: Math.sin(angle) * dist, duration: 0.7 + Math.random() * 0.3 };
});

function Sparks() {
  return (
    <span className="sparks" aria-hidden="true">
      {SPARKS.map((spark, i) => (
        <motion.span
          key={i}
          className="spark"
          initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
          animate={{ x: spark.x, y: spark.y, opacity: 0, scale: 0.3 }}
          transition={{ duration: spark.duration, ease: [0.1, 0.8, 0.3, 1], delay: 0.35 }}
        />
      ))}
    </span>
  );
}

function PlayCard({ player, isRevealPhase, isDraw, pump, index }: {
  player: TablePlayer; isRevealPhase: boolean; isDraw: boolean; pump: number | null; index: number;
}) {
  const revealed = isRevealPhase && !player.isDnf;
  const lost = revealed && !isDraw && !player.isWinner;
  // Muistetaan viimeisin paljastettu käsi, jotta kortti näyttää sen vielä kääntyessään takaisin nurin
  const [lastSymbol, setLastSymbol] = useState(player.revealedSymbol);
  if (player.revealedSymbol && player.revealedSymbol !== lastSymbol) setLastSymbol(player.revealedSymbol);
  const symbolKey = player.revealedSymbol ?? lastSymbol;
  const symbol = symbolKey ? SYMBOL_INFO[symbolKey] : null;

  let state = 'thinking';
  if (player.isDnf) state = 'dnf';
  else if (revealed) state = player.isWinner ? 'winner' : lost ? 'lost' : 'draw';
  else if (player.hasPicked) state = 'locked';

  return (
    <motion.div
      // Viimeisinä sekunteina kortit pomppaavat laskennan tahdissa (kivi–paperi–sakset-heilautus).
      // Luokka vaihtuu joka sekunti (pump-0 / pump-1), jolloin CSS-animaatio käynnistyy uudelleen.
      className={`play-card ${state} ${pump !== null ? `pump-${pump % 2}` : ''}`}
      animate={{ y: state === 'winner' ? -8 : 0, scale: state === 'winner' ? 1.12 : state === 'lost' ? 0.92 : 1 }}
      transition={{ type: 'spring', stiffness: 300, damping: 18 }}
    >
      <motion.div
        className="play-card-inner"
        initial={false}
        animate={{ rotateY: revealed ? 180 : 0 }}
        transition={{ duration: 0.55, delay: revealed ? index * 0.09 : 0, ease: [0.3, 0.7, 0.2, 1] }}
      >
        <div className="play-card-face back">
          {player.isDnf ? (
            <span className="card-dnf">💤</span>
          ) : player.hasPicked ? (
            <span className="card-mark">✓</span>
          ) : (
            <span className="thinking-dots" aria-label="miettii"><i /><i /><i /></span>
          )}
        </div>
        <div className="play-card-face front">
          <span className="card-emoji">{symbol?.emoji ?? '❓'}</span>
          <span className="card-label">{symbol?.label ?? 'Ei valintaa'}</span>
        </div>
      </motion.div>
      {state === 'winner' && <Sparks />}
    </motion.div>
  );
}

export default function GameTable({
  players, winsRequired, countdown, endsAt, totalMs, paused, isRevealPhase, isDraw,
}: GameTableProps) {
  const meIndex = Math.max(players.findIndex(p => p.isMe), 0);
  const ordered = [...players.slice(meIndex), ...players.slice(0, meIndex)];
  const { ref, w, h } = useElementSize<HTMLDivElement>();
  const layout = computeLayout(w, h, Math.min(ordered.length, 4));
  const urgent = countdown !== null && countdown <= 3 && !paused;
  const pump = urgent && !isRevealPhase ? countdown : null;
  const iWon = isRevealPhase && !isDraw && ordered[0]?.isWinner;

  return (
    <div
      ref={ref}
      style={{ '--s': layout.scale } as React.CSSProperties}
      className={`table-field players-${ordered.length} ${urgent ? 'urgent' : ''} ${iWon ? 'celebrate' : ''} ${isRevealPhase ? 'revealing' : ''}`}
    >
      <div className="table-felt" style={{ ...layout.table, borderRadius: layout.table.width / 2 }} aria-hidden="true">
        <div className="table-sweep" />
        <div className="table-glow" />
      </div>

      <div className="table-center">
        <AnimatePresence mode="wait" initial={false}>
          {paused ? (
            <motion.div key="paused" className="table-paused" initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}>
              ❙❙
            </motion.div>
          ) : countdown !== null ? (
            <motion.div key="timer" initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.6 }}>
              <CountdownRing countdown={countdown} endsAt={endsAt} totalMs={totalMs} />
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {w > 0 && isRevealPhase && !isDraw && ordered.map((player, i) => player.isWinner && (
          <motion.div
            key={`spot-${player.userId}`}
            className="spotlight"
            style={{ left: layout.seats[i]?.seat.x, top: layout.seats[i]?.seat.y }}
            initial={{ opacity: 0, scale: 0.4 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.6, delay: 0.45, ease: [0.2, 0.8, 0.2, 1] }}
            aria-hidden="true"
          />
        ))}
      </AnimatePresence>

      {w > 0 && ordered.map((player, i) => {
        const { seat, card, side } = layout.seats[i] ?? layout.seats[0]!;
        const status = !player.isConnected && !player.isBot ? 'Yhdistää…' : null;
        return (
          <div key={player.userId}>
            <div className="card-slot" style={{ left: card.x, top: card.y }}>
              <PlayCard player={player} isRevealPhase={isRevealPhase} isDraw={isDraw} pump={pump} index={i} />
            </div>

            <div
              className={[
                'seat',
                side ? 'side' : '',
                player.isMe ? 'me' : '',
                player.hasPicked && !isRevealPhase ? 'picked' : '',
                player.isDnf ? 'dnf' : '',
                isRevealPhase && !isDraw ? (player.isWinner ? 'winner' : 'loser') : '',
              ].join(' ')}
              style={{ left: seat.x, top: seat.y }}
            >
              <div className="seat-avatar">
                <WinsRing wins={player.wins} required={winsRequired} size={58} />
                <Avatar player={player} size={44} />
                <ChatBubble bubble={player.bubble} side={seat.x > w / 2 + 10 ? 'left' : 'right'} />
                {(player.matchWins > 0 || player.leaf) && (
                  <span className="match-wins" title={`${player.matchWins} pelivoittoa tässä huoneessa`}>
                    {player.matchWins > 0 && `👑${player.matchWins}`}{player.leaf && '🍃'}
                  </span>
                )}
              <AnimatePresence>
                {player.streak >= 2 && (
                  <motion.span
                    key={player.streak}
                    className="streak"
                    initial={{ scale: 0, rotate: -20 }}
                    animate={{ scale: 1, rotate: 0 }}
                    exit={{ scale: 0 }}
                    transition={{ type: 'spring', stiffness: 500, damping: 15, delay: 0.6 }}
                    title={`${player.streak} kierrosvoittoa putkeen`}
                  >
                    🔥{player.streak}
                  </motion.span>
                )}
              </AnimatePresence>
                <AnimatePresence>
                  {isRevealPhase && player.isWinner && !isDraw && (
                    <motion.span
                      className="plus-one"
                      initial={{ opacity: 0, y: 0 }}
                      animate={{ opacity: [0, 1, 1, 0], y: -34 }}
                      transition={{ duration: 1.4, delay: 0.5 }}
                    >
                      +1
                    </motion.span>
                  )}
                </AnimatePresence>
              </div>
              <div className="seat-tag">
                <div className="seat-name">
                  {player.isMe ? 'Sinä' : player.username}
                </div>
                <div className="seat-meta">
                  {status ? (
                    <span className="seat-status">{status}</span>
                  ) : (
                    <span
                      className="lives"
                      aria-label={`${player.hearts} sydäntä jäljellä`}
                      title={`${player.hearts}/${MAX_HEARTS} sydäntä — myöhästyminen vie yhden`}
                    >
                      {Array.from({ length: MAX_HEARTS }).map((_, h) => (
                        <span key={h} className={h < player.hearts ? 'life' : 'life lost'} />
                      ))}
                    </span>
                  )}
                  <span className={`seat-wins ${player.wins > 0 ? 'has' : ''}`} aria-label={`${player.wins}/${winsRequired} kierrosvoittoa`}>
                    {player.wins}<small>/{winsRequired}</small>
                  </span>
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
