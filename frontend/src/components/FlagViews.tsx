import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Avatar from './Avatar';
import ChatBubble, { type BubbleData } from './ChatBubble';
import { COUNT_OPTIONS, EXTRAS, HINT_OPTIONS, LEVELS, LEVEL_BY_VALUE, type QuizSettings } from '../constants/flags';

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

export interface FlagReveal {
  index: number;
  code: string;
  name: string;
  image: string;
  kind: FlagQuestion['kind'];
  correctOption: number | null;
  truth: boolean | null;
  results: { userId: number; correctness: Correctness; points: number; label: string | null }[];
}

export interface FlagOver {
  standings: (Omit<FlagPlayer, 'connected' | 'answered'> & { correct: number; half: number; placement: number })[];
  summary: { index: number; code: string; name: string; image: string; kind: string; results: { userId: number; correctness: Correctness; label: string | null }[] }[];
  fact: { name: string; image: string; text: string } | null;
  levelLabel: string;
  count: number;
  newRecord: boolean;
  previousBest: number | null;
}

export interface HintState {
  index: number;
  letters?: string;
  removed?: number[];
}

const RESULT_ICON: Record<Correctness, string> = { full: '✓', half: '½', wrong: '✗', none: '–' };

// ---------- Asetukset ----------
export function FlagSettingsPanel({ settings, editable, onChange }: {
  settings: QuizSettings; editable: boolean; onChange: (s: Partial<QuizSettings>) => void;
}) {
  const level = LEVEL_BY_VALUE[settings.level];
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

      <div className="setting-row">
        <span className="field-label">Lippuja</span>
        <div className="seg" role="radiogroup" aria-label="Lippujen määrä">
          {COUNT_OPTIONS.map(c => (
            <button key={c} type="button" role="radio" aria-checked={settings.count === c} className={settings.count === c ? 'active' : ''} disabled={!editable} onClick={() => onChange({ count: c })}>{c}</button>
          ))}
        </div>
      </div>

      <div className="setting-row">
        <span className="field-label">Vinkkejä per pelaaja</span>
        <div className="seg" role="radiogroup" aria-label="Vinkkien määrä">
          {HINT_OPTIONS.map(h => (
            <button key={h} type="button" role="radio" aria-checked={settings.hints === h} className={settings.hints === h ? 'active' : ''} disabled={!editable} onClick={() => onChange({ hints: h })}>{h === 0 ? 'Pois' : h}</button>
          ))}
        </div>
      </div>

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
                title={allowed ? e.text : 'Ei käytössä tällä tasolla'}
              >
                <b>{on ? '✓ ' : ''}{e.label}</b>
                <span>{allowed ? e.text : 'Ei tällä tasolla'}</span>
              </button>
            );
          })}
        </div>
      </div>
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
function useQuestionProgress(question: FlagQuestion, stopped: boolean, apply: (progress: number) => void) {
  const applyRef = useRef(apply);
  useEffect(() => { applyRef.current = apply; });
  useEffect(() => {
    const startElapsed = question.timeMs - question.remainingMs;
    let frame = 0;
    const tick = () => {
      const elapsed = startElapsed + (Date.now() - question.receivedAt);
      applyRef.current(Math.min(1, Math.max(0, elapsed / question.timeMs)));
      if (!stopped && elapsed < question.timeMs) frame = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(frame);
  }, [question, stopped]);
}

function TimerBar({ question, stopped }: { question: FlagQuestion; stopped: boolean }) {
  const fill = useRef<HTMLDivElement>(null);
  useQuestionProgress(question, stopped, (p) => {
    if (!fill.current) return;
    fill.current.style.transform = `scaleX(${1 - p})`;
    fill.current.classList.toggle('low', p > 0.7);
  });
  return (
    <div className="flag-timer" aria-hidden="true">
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

// ---------- Kysymys ----------
export function FlagQuestionView({ question, answered, myAnswer, hint, hintsLeft, onAnswer, onHint }: {
  question: FlagQuestion;
  answered: boolean;
  myAnswer: string | number | boolean | null;
  hint: HintState | null;
  hintsLeft: number;
  onAnswer: (value: string | number | boolean) => void;
  onHint: (type: 'letters' | 'fifty') => void;
}) {
  const [text, setText] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const removed = hint?.index === question.index ? hint.removed ?? [] : [];
  const letters = hint?.index === question.index ? hint.letters : undefined;

  useEffect(() => {
    if (question.kind === 'write' && !answered) input.current?.focus();
  }, [question.index, question.kind, answered]);

  const canFifty = (question.kind === 'choice' || question.kind === 'flagChoice') && hintsLeft > 0 && removed.length === 0 && !answered;
  const canLetters = question.kind === 'write' && hintsLeft > 0 && !letters && !answered;

  return (
    <div className="flag-question">
      <TimerBar question={question} stopped={answered} />

      {question.kind === 'flagChoice' ? (
        <>
          <p className="flag-prompt">Valitse lippu: <b>{question.name}</b></p>
          <div className="flag-option-grid">
            {question.options!.map((o, i) => (
              <button
                key={i}
                className={`flag-option-img ${myAnswer === i ? 'picked' : ''}`}
                disabled={answered || removed.includes(i)}
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
          <FlagImage src={question.image!} question={question} done={answered} />
          {question.kind === 'trueFalse' && <p className="flag-prompt">Onko tämä lippu <b>{question.name}</b>?</p>}
          {question.kind === 'choice' && <p className="flag-prompt">Minkä maan lippu?</p>}
          {question.kind === 'write' && <p className="flag-prompt">Kirjoita maan nimi</p>}
        </>
      )}

      {question.kind === 'choice' && (
        <div className="flag-options">
          {question.options!.map((o, i) => (
            <button key={i} className={`flag-option ${myAnswer === i ? 'picked' : ''}`} disabled={answered || removed.includes(i)} onClick={() => onAnswer(i)}>
              {o.label}
            </button>
          ))}
        </div>
      )}

      {question.kind === 'trueFalse' && (
        <div className="flag-options two">
          <button className={`flag-option yes ${myAnswer === true ? 'picked' : ''}`} disabled={answered} onClick={() => onAnswer(true)}>Totta</button>
          <button className={`flag-option no ${myAnswer === false ? 'picked' : ''}`} disabled={answered} onClick={() => onAnswer(false)}>Tarua</button>
        </div>
      )}

      {question.kind === 'write' && (
        <form className="flag-write" onSubmit={(e) => { e.preventDefault(); if (text.trim()) onAnswer(text.trim()); }}>
          {letters && <p className="flag-letters" aria-label="Vinkki">{letters}</p>}
          <input
            ref={input}
            className="input"
            placeholder="Maan nimi"
            maxLength={60}
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="send"
            value={answered && typeof myAnswer === 'string' ? myAnswer : text}
            disabled={answered}
            onChange={(e) => setText(e.target.value)}
            aria-label="Maan nimi"
          />
          <button className="btn btn-primary" type="submit" disabled={answered || !text.trim()}>Vastaa</button>
        </form>
      )}

      <div className="flag-hint-row">
        {answered ? (
          <span className="faint">Vastaus lukittu</span>
        ) : canFifty ? (
          <button className="btn btn-ghost btn-sm" onClick={() => onHint('fifty')}>💡 50/50 <span className="faint">({hintsLeft})</span></button>
        ) : canLetters ? (
          <button className="btn btn-ghost btn-sm" onClick={() => onHint('letters')}>💡 Alkukirjain <span className="faint">({hintsLeft})</span></button>
        ) : hintsLeft > 0 && !letters && removed.length === 0 ? (
          <span className="faint">Vinkkejä {hintsLeft} — ei tähän kysymykseen</span>
        ) : null}
      </div>
    </div>
  );
}

// ---------- Paljastus ----------
export function FlagRevealView({ reveal, myUserId, players }: { reveal: FlagReveal; myUserId?: number; players: FlagPlayer[] }) {
  const mine = reveal.results.find(r => r.userId === myUserId);
  const others = reveal.results.filter(r => r.userId !== myUserId);
  const name = (id: number) => players.find(p => p.userId === id)?.username ?? '?';
  const verdict = !mine || mine.correctness === 'none' ? 'Aika loppui' : mine.correctness === 'full' ? 'Oikein!' : mine.correctness === 'half' ? 'Melkein!' : 'Väärin';
  return (
    <motion.div className="flag-reveal" initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.25 }}>
      <div className="flag-frame"><img src={reveal.image} alt={reveal.name} draggable={false} /></div>
      <h2 className="flag-answer-name">{reveal.name}</h2>
      <div className={`flag-verdict ${mine?.correctness ?? 'none'}`}>
        <span>{verdict}</span>
        {mine && mine.points > 0 && <b>+{mine.points}</b>}
      </div>
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
    </motion.div>
  );
}

// ---------- Pelin loppu ----------
export function FlagGameOverView({ over, myUserId, isHost, solo, onReplay, onSettings, onExit }: {
  over: FlagOver; myUserId?: number; isHost: boolean; solo: boolean;
  onReplay: () => void; onSettings: () => void; onExit: () => void;
}) {
  const [showSummary, setShowSummary] = useState(false);
  const me = over.standings.find(s => s.userId === myUserId);
  const winner = over.standings[0];
  return (
    <motion.div className="flag-over" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
      <div className="flag-over-head">
        <span className="flag-over-trophy" aria-hidden="true">{solo ? (over.newRecord ? '🏆' : '🎯') : me?.placement === 1 ? '🏆' : '🏁'}</span>
        <h1>{solo ? `${me?.score ?? 0} pistettä` : winner?.userId === myUserId ? 'Voitit!' : `${winner?.username} voitti`}</h1>
        <p className="muted">{over.levelLabel} · {over.count} lippua{me ? ` · ${me.correct} oikein` : ''}</p>
        {solo && over.newRecord && <span className="record-badge">Uusi ennätys!</span>}
        {solo && !over.newRecord && over.previousBest !== null && <span className="faint">Ennätyksesi: {over.previousBest}</span>}
      </div>

      {!solo && (
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

      <button className="btn btn-ghost btn-block" onClick={() => setShowSummary(s => !s)} aria-expanded={showSummary}>
        {showSummary ? 'Piilota liput' : 'Näytä kaikki liput'}
      </button>
      <AnimatePresence initial={false}>
        {showSummary && (
          <motion.ul className="flag-summary" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            {over.summary.map(q => {
              const mine = q.results.find(r => r.userId === myUserId);
              const correctCount = q.results.filter(r => r.correctness === 'full').length;
              return (
                <li key={q.index}>
                  <img src={q.image} alt="" draggable={false} />
                  <span className="summary-name">
                    {q.name}
                    {mine?.label && mine.correctness !== 'full' && <span className="faint"> · vastasit {mine.label}</span>}
                  </span>
                  {!solo && <span className="faint">{correctCount}/{q.results.length}</span>}
                  <span className={`flag-result-icon ${mine?.correctness ?? 'none'}`}>{RESULT_ICON[mine?.correctness ?? 'none']}</span>
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
            <button className="btn btn-secondary btn-block" onClick={onSettings}>Muuta asetuksia</button>
          </>
        ) : (
          <p className="faint waiting-host">Odotetaan, että host aloittaa uuden pelin…</p>
        )}
        <button className="btn btn-ghost btn-block" onClick={onExit}>Poistu</button>
      </div>
    </motion.div>
  );
}
