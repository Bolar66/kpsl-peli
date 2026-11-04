import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Avatar from './Avatar';
import ChatBubble, { type BubbleData } from './ChatBubble';
import {
  CHOICE_SECONDS, COUNT_OPTIONS, EXTRAS, HINT_OPTIONS, LEVELS, LEVEL_BY_VALUE, WRITE_SECONDS, type QuizSettings,
} from '../constants/flags';
import { sfx } from '../constants/sound';

// ---------- Palvelimen viestien muodot ----------
export interface FlagPlayer {
  userId: number;
  username: string;
  avatarEmoji: string | null;
  avatarColor: string | null;
  avatarImage: string | null;
  connected: boolean;
  score: number;
  answered: boolean;
}

export interface FlagQuestion {
  index: number;
  total: number;
  kind: 'choice' | 'write' | 'flagChoice' | 'trueFalse';
  display: 'normal' | 'reveal' | 'piece';
  image: string | null;
  options: { label?: string; image?: string }[] | null;
  name: string | null;
  timeMs: number;
  remainingMs: number;
  receivedAt: number;
}

export type Correctness = 'full' | 'half' | 'wrong' | 'none';

export interface RevealResult {
  userId: number;
  correctness: Correctness;
  points: number;
  label: string | null;
  streak: number;
  streakBonus: number;
}

export interface FlagReveal {
  index: number;
  code: string;
  name: string;
  image: string;
  kind: FlagQuestion['kind'];
  correctOption: number | null;
  truth: boolean | null;
  results: RevealResult[];
}

export interface FlagOver {
  standings: (Omit<FlagPlayer, 'connected' | 'answered'> & { correct: number; half: number; placement: number })[];
  summary: { index: number; code: string; name: string; image: string; kind: string; results: { userId: number; correctness: Correctness; label: string | null }[] }[];
  fact: { name: string; image: string; text: string } | null;
  level: QuizSettings['level'];
  levelLabel: string;
  count: number;
  newRecord: boolean;
  previousBest: number | null;
  practice: boolean;
}

export interface HintState {
  index: number;
  letters?: string;
  removed?: number[];
}

const RESULT_ICON: Record<Correctness, string> = { full: '✓', half: '½', wrong: '✗', none: '–' };
const SHARE_SQUARE: Record<Correctness, string> = { full: '🟩', half: '🟨', wrong: '🟥', none: '⬜' };

// ---------- Asetukset ----------
function SettingSeg<T extends number>({ label, options, value, editable, onChange, format }: {
  label: string; options: T[]; value: T; editable: boolean; onChange: (v: T) => void; format?: (v: T) => string;
}) {
  return (
    <div className="setting-row">
      <span className="field-label">{label}</span>
      <div className="seg" role="radiogroup" aria-label={label}>
        {options.map(o => (
          <button key={o} type="button" role="radio" aria-checked={value === o} className={value === o ? 'active' : ''} disabled={!editable} onClick={() => onChange(o)}>
            {format ? format(o) : o}
          </button>
        ))}
      </div>
    </div>
  );
}

export function FlagSettingsPanel({ settings, editable, practice, onChange }: {
  settings: QuizSettings; editable: boolean; practice?: boolean; onChange: (s: Partial<QuizSettings>) => void;
}) {
  const [more, setMore] = useState(false);
  const level = LEVEL_BY_VALUE[settings.level];
  const activeExtras = settings.extras.filter(e => level.extras.includes(e)).length;
  return (
    <section className={`card flag-settings ${editable ? '' : 'readonly'}`}>
      <div className="section-head"><h2>Asetukset</h2>{!editable && <span className="faint">host valitsee</span>}</div>
      <div className="level-grid" role="radiogroup" aria-label="Taso">
        {LEVELS.map(l => (
          <button
            key={l.value}
            type="button"
            role="radio"
            aria-checked={settings.level === l.value}
            className={`level-card ${settings.level === l.value ? 'active' : ''}`}
            disabled={!editable}
            onClick={() => onChange({ level: l.value })}
          >
            <span className="level-emoji" aria-hidden="true">{l.emoji}</span>
            <b>{l.label}</b>
            <span>{l.text}</span>
          </button>
        ))}
      </div>

      {!practice && (
        <SettingSeg label="Lippuja" options={COUNT_OPTIONS} value={settings.count} editable={editable} onChange={(count) => onChange({ count })} />
      )}
      <SettingSeg label="Vinkkejä per pelaaja" options={HINT_OPTIONS} value={settings.hints} editable={editable} onChange={(hints) => onChange({ hints })} format={(h) => (h === 0 ? 'Pois' : String(h))} />

      <button type="button" className="more-settings" onClick={() => setMore(m => !m)} aria-expanded={more}>
        <span>Lisää asetuksia</span>
        <span className="faint">{settings.choiceSeconds} s / {settings.writeSeconds} s · {activeExtras} lisätapaa {more ? '▴' : '▾'}</span>
      </button>

      {more && (
        <>
          <SettingSeg label="Aikaa monivalintaan" options={CHOICE_SECONDS} value={settings.choiceSeconds} editable={editable} onChange={(choiceSeconds) => onChange({ choiceSeconds })} format={(s) => `${s} s`} />
          <SettingSeg label="Aikaa kirjoittamiseen" options={WRITE_SECONDS} value={settings.writeSeconds} editable={editable} onChange={(writeSeconds) => onChange({ writeSeconds })} format={(s) => `${s} s`} />
          <div className="setting-row">
            <span className="field-label">Lisätavat</span>
            <div className="extra-grid">
              {EXTRAS.map(e => {
                const allowed = level.extras.includes(e.value);
                const on = allowed && settings.extras.includes(e.value);
                return (
                  <button
                    key={e.value}
                    type="button"
                    className={`extra-toggle ${on ? 'on' : ''}`}
                    disabled={!editable || !allowed}
                    aria-pressed={on}
                    onClick={() => onChange({ extras: on ? settings.extras.filter(x => x !== e.value) : [...settings.extras, e.value] })}
                  >
                    <b>{on ? '✓ ' : ''}{e.label}</b>
                    <span>{allowed ? e.text : 'Ei tällä tasolla'}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}
    </section>
  );
}

// ---------- Pelaajarivi ----------
export function FlagPlayerChips({ players, myUserId, bubbles, showScore, showAnswered }: {
  players: FlagPlayer[]; myUserId?: number; bubbles: Record<number, BubbleData>; showScore: boolean; showAnswered: boolean;
}) {
  const sorted = showScore ? [...players].sort((a, b) => b.score - a.score) : players;
  return (
    <ul className="flag-players">
      {sorted.map(p => (
        <li key={p.userId} className={`${p.connected ? '' : 'away'} ${p.userId === myUserId ? 'me' : ''}`}>
          <span className="flag-player-avatar">
            <Avatar player={{ userId: p.userId, username: p.username, avatarEmoji: p.avatarEmoji, avatarColor: p.avatarColor, avatarImage: p.avatarImage }} size={36} />
            {showAnswered && p.answered && <span className="answered-mark" aria-label="vastasi">✓</span>}
            <ChatBubble bubble={bubbles[p.userId] ?? null} side="up" />
          </span>
          <span className="flag-player-name">{p.userId === myUserId ? 'Sinä' : p.username}</span>
          {showScore && <b className="flag-player-score">{p.score}</b>}
        </li>
      ))}
    </ul>
  );
}

// ---------- Ajastin ja lippuefektit ----------
// Päivitetään JavaScriptillä eikä CSS-animaatioilla: "vähennä liikettä" -asetus nopeuttaa CSS-animaatiot
// välittömiksi, jolloin ajastin ja paljastuva lippu eivät toimisi.
function useQuestionProgress(question: FlagQuestion, stopped: boolean, apply: (progress: number, remainingMs: number) => void) {
  const applyRef = useRef(apply);
  useEffect(() => { applyRef.current = apply; });
  useEffect(() => {
    const startElapsed = question.timeMs - question.remainingMs;
    let frame = 0;
    const tick = () => {
      const elapsed = startElapsed + (Date.now() - question.receivedAt);
      applyRef.current(Math.min(1, Math.max(0, elapsed / question.timeMs)), Math.max(0, question.timeMs - elapsed));
      if (!stopped && elapsed < question.timeMs) frame = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(frame);
  }, [question, stopped]);
}

// Viimeisillä kolmella sekunnilla palkki sykkii ja kello tikittää
function TimerBar({ question, stopped }: { question: FlagQuestion; stopped: boolean }) {
  const bar = useRef<HTMLDivElement>(null);
  const fill = useRef<HTMLDivElement>(null);
  const lastTick = useRef<number | null>(null);
  useQuestionProgress(question, stopped, (p, remainingMs) => {
    if (!fill.current || !bar.current) return;
    fill.current.style.transform = `scaleX(${1 - p})`;
    const seconds = Math.ceil(remainingMs / 1000);
    const urgent = !stopped && seconds <= 3 && remainingMs > 0;
    bar.current.classList.toggle('urgent', urgent);
    if (urgent && lastTick.current !== seconds) {
      lastTick.current = seconds;
      sfx.tick(seconds === 1);
    }
  });
  return (
    <div ref={bar} className="flag-timer" aria-hidden="true">
      <div ref={fill} className={`flag-timer-fill ${stopped ? 'stopped' : ''}`} />
    </div>
  );
}

// Lippukuva efekteineen: paljastuva lippu tarkentuu, palanen lippua laajenee kulmasta.
// Efekti valmistuu, kun 80 % ajasta on kulunut tai kun pelaaja on vastannut.
function FlagImage({ src, question, done }: { src: string; question: FlagQuestion; done: boolean }) {
  const img = useRef<HTMLImageElement>(null);
  const corner = ['top left', 'top right', 'bottom left', 'bottom right', 'center'][question.index % 5];
  const effect = done ? 'normal' : question.display;
  useQuestionProgress(question, done, (p) => {
    if (!img.current) return;
    const t = Math.min(1, p / 0.8);
    const ease = 1 - (1 - t) * (1 - t);
    img.current.style.filter = effect === 'reveal' ? `blur(${(28 * (1 - ease)).toFixed(1)}px) saturate(${0.6 + 0.4 * ease})` : '';
    img.current.style.transform = effect === 'piece' ? `scale(${(5 - 4 * ease).toFixed(3)})` : '';
  });
  return (
    <div className="flag-frame">
      <img ref={img} src={src} alt="Lippu" draggable={false} style={{ transformOrigin: corner }} />
    </div>
  );
}

// ---------- Kysymys ja sen paljastus ----------
// Paljastus näytetään samassa näkymässä: oikea vaihtoehto vihreänä, oma väärä punaisena
export function FlagQuestionView({ question, reveal, myUserId, players, answered, myAnswer, hint, hintsLeft, paused, onAnswer, onHint }: {
  question: FlagQuestion;
  reveal: FlagReveal | null;
  myUserId?: number;
  players: FlagPlayer[];
  answered: boolean;
  myAnswer: string | number | boolean | null;
  hint: HintState | null;
  hintsLeft: number;
  paused: boolean;
  onAnswer: (value: string | number | boolean) => void;
  onHint: (type: 'letters' | 'fifty') => void;
}) {
  const [text, setText] = useState('');
  const [typing, setTyping] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const shown = reveal && reveal.index === question.index ? reveal : null;
  const locked = answered || !!shown || paused;
  const removed = hint?.index === question.index ? hint.removed ?? [] : [];
  const letters = hint?.index === question.index ? hint.letters : undefined;
  const mine = shown?.results.find(r => r.userId === myUserId);

  useEffect(() => {
    if (question.kind === 'write' && !answered && !shown) input.current?.focus();
  }, [question.index, question.kind, answered, shown]);

  const canFifty = (question.kind === 'choice' || question.kind === 'flagChoice') && hintsLeft > 0 && removed.length === 0 && !locked;
  const canLetters = question.kind === 'write' && hintsLeft > 0 && !letters && !locked;

  // Vaihtoehdon väri paljastuksessa
  const optionState = (i: number) => {
    if (!shown) return myAnswer === i ? 'picked' : '';
    if (i === shown.correctOption) return 'correct';
    if (myAnswer === i) return 'wrong';
    return 'faded';
  };
  const boolState = (value: boolean) => {
    if (!shown) return myAnswer === value ? 'picked' : '';
    if (value === shown.truth) return 'correct';
    if (myAnswer === value) return 'wrong';
    return 'faded';
  };

  return (
    <div className={`flag-question ${typing && !shown ? 'typing' : ''} ${mine && (mine.correctness === 'wrong' || mine.correctness === 'none') ? 'shake' : ''} ${paused ? 'paused' : ''}`}>
      <TimerBar question={question} stopped={locked} />

      {question.kind === 'flagChoice' ? (
        <>
          <p className="flag-prompt">Valitse lippu: <b>{question.name}</b></p>
          <div className="flag-option-grid">
            {question.options!.map((o, i) => (
              <button
                key={i}
                className={`flag-option-img ${optionState(i)}`}
                disabled={locked || removed.includes(i)}
                onClick={() => onAnswer(i)}
                aria-label={`Lippu ${i + 1}`}
              >
                <img src={o.image} alt="" draggable={false} />
              </button>
            ))}
          </div>
        </>
      ) : (
        <>
          <FlagImage src={question.image!} question={question} done={locked} />
          {question.kind === 'trueFalse' && <p className="flag-prompt">Onko tämä lippu <b>{question.name}</b>?</p>}
          {question.kind === 'choice' && !shown && <p className="flag-prompt">Minkä maan lippu?</p>}
          {question.kind === 'write' && !shown && <p className="flag-prompt">Kirjoita maan nimi</p>}
        </>
      )}

      {shown && (question.kind === 'write' || question.kind === 'trueFalse') && (
        <p className="flag-correct-name">{shown.name}</p>
      )}

      {question.kind === 'choice' && (
        <div className="flag-options">
          {question.options!.map((o, i) => (
            <button key={i} className={`flag-option ${optionState(i)}`} disabled={locked || removed.includes(i)} onClick={() => onAnswer(i)}>
              {o.label}
            </button>
          ))}
        </div>
      )}

      {question.kind === 'trueFalse' && (
        <div className="flag-options two">
          <button className={`flag-option yes ${boolState(true)}`} disabled={locked} onClick={() => onAnswer(true)}>Totta</button>
          <button className={`flag-option no ${boolState(false)}`} disabled={locked} onClick={() => onAnswer(false)}>Tarua</button>
        </div>
      )}

      {question.kind === 'write' && (
        <form className="flag-write" onSubmit={(e) => { e.preventDefault(); if (text.trim()) onAnswer(text.trim()); }}>
          {letters && !shown && <p className="flag-letters" aria-label="Vinkki">{letters}</p>}
          <input
            ref={input}
            className={`input ${shown ? `result-${mine?.correctness ?? 'none'}` : ''}`}
            placeholder="Maan nimi"
            maxLength={60}
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="send"
            value={answered && typeof myAnswer === 'string' ? myAnswer : text}
            disabled={locked}
            onFocus={() => setTyping(true)}
            onBlur={() => setTyping(false)}
            onChange={(e) => setText(e.target.value)}
            aria-label="Maan nimi"
          />
          {!shown && <button className="btn btn-primary" type="submit" disabled={locked || !text.trim()}>Vastaa</button>}
        </form>
      )}

      {shown ? (
        <RevealStrip reveal={shown} mine={mine} myUserId={myUserId} players={players} />
      ) : (
        <div className="flag-hint-row">
          {answered ? (
            <span className="faint">Vastaus lukittu</span>
          ) : canFifty ? (
            <button className="btn btn-ghost btn-sm" onClick={() => onHint('fifty')}>💡 50/50 <span className="faint">({hintsLeft})</span></button>
          ) : canLetters ? (
            <button className="btn btn-ghost btn-sm" onClick={() => onHint('letters')}>💡 Alkukirjain <span className="faint">({hintsLeft})</span></button>
          ) : null}
        </div>
      )}
    </div>
  );
}

// Paljastuksen tulosrivi: oma tulos, pisteet, putki ja muiden tulokset
function RevealStrip({ reveal, mine, myUserId, players }: { reveal: FlagReveal; mine?: RevealResult; myUserId?: number; players: FlagPlayer[] }) {
  const verdict = !mine || mine.correctness === 'none' ? 'Aika loppui' : mine.correctness === 'full' ? 'Oikein!' : mine.correctness === 'half' ? 'Melkein!' : 'Väärin';
  const others = reveal.results.filter(r => r.userId !== myUserId);
  const name = (id: number) => players.find(p => p.userId === id)?.username ?? '?';
  return (
    <div className="reveal-strip">
      <div className={`flag-verdict ${mine?.correctness ?? 'none'}`}>
        {mine?.correctness === 'full' && <Burst />}
        <span>{verdict}</span>
        {mine && mine.points > 0 && <motion.b className="points-pop" initial={{ y: 8, opacity: 0, scale: 0.6 }} animate={{ y: 0, opacity: 1, scale: 1 }} transition={{ type: 'spring', stiffness: 500, damping: 18 }}>+{mine.points}</motion.b>}
      </div>
      {mine && mine.streak >= 2 && (
        <p className="streak-line">🔥 {mine.streak} putkeen{mine.streakBonus > 0 ? ` · putkibonus +${mine.streakBonus}` : ''}</p>
      )}
      {mine?.label && mine.correctness !== 'full' && reveal.kind === 'write' && <p className="faint flag-your-answer">Vastasit: {mine.label}</p>}
      {others.length > 0 && (
        <ul className="flag-others">
          {others.map(r => (
            <li key={r.userId} className={r.correctness}>
              <span className="flag-result-icon">{RESULT_ICON[r.correctness]}</span>
              <span>{name(r.userId)}</span>
              {r.points > 0 && <b>+{r.points}</b>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// Oikean vastauksen kipinät
const BURST = Array.from({ length: 10 }, (_, i) => {
  const angle = (i / 10) * Math.PI * 2;
  return { x: Math.cos(angle) * 46, y: Math.sin(angle) * 26 };
});
function Burst() {
  return (
    <span className="burst" aria-hidden="true">
      {BURST.map((b, i) => (
        <motion.span
          key={i}
          initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
          animate={{ x: b.x, y: b.y, opacity: 0, scale: 0.4 }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
        />
      ))}
    </span>
  );
}

// Varanäkymä, kun palataan huoneeseen kesken paljastuksen (kysymystä ei ole tallessa)
export function FlagRevealView({ reveal, myUserId, players }: { reveal: FlagReveal; myUserId?: number; players: FlagPlayer[] }) {
  const mine = reveal.results.find(r => r.userId === myUserId);
  return (
    <div className="flag-question">
      <div className="flag-frame"><img src={reveal.image} alt={reveal.name} draggable={false} /></div>
      <p className="flag-correct-name">{reveal.name}</p>
      <RevealStrip reveal={reveal} mine={mine} myUserId={myUserId} players={players} />
    </div>
  );
}

// ---------- Pelin loppu ----------
function shareText(over: FlagOver, myUserId?: number) {
  const me = over.standings.find(s => s.userId === myUserId);
  const level = LEVEL_BY_VALUE[over.level];
  const squares = over.summary.map(q => SHARE_SQUARE[q.results.find(r => r.userId === myUserId)?.correctness ?? 'none']);
  const rows: string[] = [];
  for (let i = 0; i < squares.length; i += 10) rows.push(squares.slice(i, i + 10).join(''));
  return `BOWL Lippuvisa ${level.emoji} ${level.label}\n${(me?.score ?? 0).toLocaleString('fi-FI')} p · ${me?.correct ?? 0}/${over.count} oikein\n${rows.join('\n')}\n${window.location.origin}/lippu`;
}

export function FlagGameOverView({ over, myUserId, isHost, solo, onReplay, onSettings, onPractice, onExit }: {
  over: FlagOver; myUserId?: number; isHost: boolean; solo: boolean;
  onReplay: () => void; onSettings: () => void; onPractice: (codes: string[]) => void; onExit: () => void;
}) {
  const [showSummary, setShowSummary] = useState(false);
  const [copied, setCopied] = useState(false);
  const me = over.standings.find(s => s.userId === myUserId);
  const winner = over.standings[0];
  const missed = over.summary.filter(q => q.results.find(r => r.userId === myUserId)?.correctness !== 'full').map(q => q.code);

  async function share() {
    const text = shareText(over, myUserId);
    try {
      if (navigator.share && window.matchMedia('(pointer: coarse)').matches) { await navigator.share({ text }); return; }
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* jako peruttiin */ }
  }

  return (
    <motion.div className="flag-over" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
      <div className="flag-over-head">
        <span className="flag-over-trophy" aria-hidden="true">{over.practice ? '📚' : solo ? (over.newRecord ? '🏆' : '🎯') : me?.placement === 1 ? '🏆' : '🏁'}</span>
        <h1>{solo || over.practice ? `${me?.score ?? 0} pistettä` : winner?.userId === myUserId ? 'Voitit!' : `${winner?.username} voitti`}</h1>
        <p className="muted">{over.practice ? 'Harjoitus' : over.levelLabel} · {over.count} lippua{me ? ` · ${me.correct} oikein` : ''}</p>
        {solo && over.newRecord && <span className="record-badge">Uusi ennätys!</span>}
        {solo && !over.newRecord && !over.practice && over.previousBest !== null && <span className="faint">Ennätyksesi: {over.previousBest}</span>}
      </div>

      {!solo && !over.practice && (
        <ol className="standings flag-standings">
          {over.standings.map(s => (
            <li key={s.userId} className={`${s.placement === 1 ? 'first' : ''} ${s.userId === myUserId ? 'me' : ''}`}>
              <span className="standing-rank">{['🥇', '🥈', '🥉'][s.placement - 1] ?? `${s.placement}.`}</span>
              <Avatar player={{ userId: s.userId, username: s.username, avatarEmoji: s.avatarEmoji, avatarColor: s.avatarColor, avatarImage: s.avatarImage }} size={32} />
              <span className="standing-name">{s.userId === myUserId ? 'Sinä' : s.username}</span>
              <span className="faint">{s.correct} ✓</span>
              <b className="standing-wins">{s.score}</b>
            </li>
          ))}
        </ol>
      )}

      {over.fact && (
        <section className="card flag-fact">
          <img src={over.fact.image} alt={over.fact.name} draggable={false} />
          <div>
            <p className="eyebrow">Tiesitkö? · {over.fact.name}</p>
            <p>{over.fact.text}</p>
          </div>
        </section>
      )}

      <div className="over-tools">
        <button className="btn btn-secondary" onClick={share}>{copied ? 'Kopioitu ✓' : '📤 Jaa tulos'}</button>
        {missed.length > 0 && <button className="btn btn-secondary" onClick={() => onPractice(missed)}>📚 Harjoittele virheet ({missed.length})</button>}
      </div>

      <button className="btn btn-ghost btn-block" onClick={() => setShowSummary(s => !s)} aria-expanded={showSummary}>
        {showSummary ? 'Piilota liput' : 'Näytä kaikki liput'}
      </button>
      <AnimatePresence initial={false}>
        {showSummary && (
          <motion.ul className="flag-summary" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            {over.summary.map(q => {
              const result = q.results.find(r => r.userId === myUserId);
              const correctCount = q.results.filter(r => r.correctness === 'full').length;
              return (
                <li key={q.index}>
                  <img src={q.image} alt="" draggable={false} />
                  <span className="summary-name">
                    {q.name}
                    {result?.label && result.correctness !== 'full' && <span className="faint"> · vastasit {result.label}</span>}
                  </span>
                  {!solo && <span className="faint">{correctCount}/{q.results.length}</span>}
                  <span className={`flag-result-icon ${result?.correctness ?? 'none'}`}>{RESULT_ICON[result?.correctness ?? 'none']}</span>
                </li>
              );
            })}
          </motion.ul>
        )}
      </AnimatePresence>

      <div className="sheet-actions">
        {isHost ? (
          <>
            <button className="btn btn-primary btn-block" onClick={onReplay}>Pelaa uudestaan</button>
            {!over.practice && <button className="btn btn-secondary btn-block" onClick={onSettings}>Muuta asetuksia</button>}
          </>
        ) : (
          <p className="faint waiting-host">Odotetaan, että host aloittaa uuden pelin…</p>
        )}
        <button className="btn btn-ghost btn-block" onClick={onExit}>Poistu</button>
      </div>
    </motion.div>
  );
}

// Lippuvisan säännöt taukovalikkoon
export function FlagRules() {
  return (
    <ul className="flag-rules">
      <li><b>Pisteet:</b> oikeasta 100 ja nopeudesta enintään 50 lisää. Lähes oikein kirjoitettu nimi antaa puolet.</li>
      <li><b>Putki:</b> kolmannesta peräkkäisestä oikeasta alkaen +10, +20… (enintään +50).</li>
      <li><b>Kirjoitus:</b> suomen- ja englanninkieliset nimet, lyhenteet ja tutut vaihtoehdot kelpaavat (Hollanti, USA). Ääkköset ja välimerkit saavat puuttua.</li>
      <li><b>Vinkit:</b> 50/50 poistaa kaksi väärää vaihtoehtoa, alkukirjain näyttää nimen pituuden.</li>
      <li><b>Tauko:</b> aika pysähtyy kaikilta, ja peli jatkuu kun kaikki ovat valmiita.</li>
    </ul>
  );
}
