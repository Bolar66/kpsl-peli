import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '../context/AuthContext';
import { AuthError } from '../api/games';
import { createFlagRoom, getFlagRecords, type FlagRecord } from '../api/flags';
import AppHeader from '../components/AppHeader';
import Avatar from '../components/Avatar';
import { COUNT_OPTIONS, LEVELS, type QuizLevel } from '../constants/flags';
import './Lobby.css';
import './Flags.css';

const ROOM_CODE_CHARS = /[^ABCDEFGHJKLMNPQRSTUVWXYZ23456789]/g;

// Lippuvisan aula: yksinpeli, oma huone kavereille, liittyminen koodilla ja ennätykset
export default function FlagMenu() {
  const { token, logout } = useAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = useState<'solo' | 'room' | null>(null);
  const [error, setError] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [level, setLevel] = useState<QuizLevel>('tourist');
  const [count, setCount] = useState(10);
  const [records, setRecords] = useState<{ key: string; list: FlagRecord[] } | null>(null);

  const handleError = useCallback((err: unknown) => {
    if (err instanceof AuthError) { logout(); return; }
    setError(err instanceof Error ? err.message : 'Jokin meni pieleen');
  }, [logout]);

  const recordKey = `${level}-${count}`;
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    getFlagRecords(token, level, count)
      .then(list => { if (!cancelled) setRecords({ key: `${level}-${count}`, list }); })
      .catch(handleError);
    return () => { cancelled = true; };
  }, [token, level, count, handleError]);

  async function start(solo: boolean) {
    if (!token || busy) return;
    setBusy(solo ? 'solo' : 'room');
    setError('');
    try {
      const code = await createFlagRoom(token, { solo });
      navigate(`/lippu/${code}`);
    } catch (err) {
      handleError(err);
      setBusy(null);
    }
  }

  const shownRecords = records?.key === recordKey ? records.list : null;

  return (
    <div className="lobby-page">
      <AppHeader left={<Link to="/pelit" className="back-link"><span aria-hidden="true">←</span> Pelit</Link>} />

      <motion.main
        className="lobby-main"
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.2, 0.8, 0.2, 1] }}
      >
        <div className="lobby-hero">
          <h1>Lippuvisa</h1>
          <p className="muted">Tunnistatko maailman liput? Pelaa yksin tai haasta kaverit.</p>
        </div>

        {error && <p className="alert alert-danger" role="alert">{error}</p>}

        <div className="flag-mode-grid">
          <button className="card flag-mode" onClick={() => start(true)} disabled={busy !== null}>
            <span className="flag-mode-emoji" aria-hidden="true">🎯</span>
            <b>{busy === 'solo' ? 'Avataan…' : 'Yksinpeli'}</b>
            <span>Harjoittele ja tee ennätyksiä</span>
          </button>
          <button className="card flag-mode accent" onClick={() => start(false)} disabled={busy !== null}>
            <span className="flag-mode-emoji" aria-hidden="true">👥</span>
            <b>{busy === 'room' ? 'Luodaan…' : 'Pelaa kavereiden kanssa'}</b>
            <span>Luo huone ja kutsu kaverit</span>
          </button>
        </div>

        <section className="card lobby-card">
          <div>
            <p className="eyebrow">Onko sinulla koodi?</p>
            <h2 className="lobby-card-title">Liity huoneeseen</h2>
          </div>
          <form className="join-form" onSubmit={(e) => { e.preventDefault(); if (joinCode.length === 4) navigate(`/lippu/${joinCode}`); }}>
            <input
              className="input code-input"
              placeholder="ABCD"
              maxLength={4}
              autoCapitalize="characters"
              autoComplete="off"
              spellCheck={false}
              aria-label="Huonekoodi"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase().replace(ROOM_CODE_CHARS, '').slice(0, 4))}
            />
            <button className="btn btn-secondary" type="submit" disabled={joinCode.length !== 4}>Liity</button>
          </form>
        </section>

        <section className="card records-card">
          <div className="section-head"><h2>Ennätykset</h2><span className="faint">yksinpeli</span></div>
          <div className="seg level-seg" role="tablist" aria-label="Taso">
            {LEVELS.map(l => (
              <button key={l.value} role="tab" aria-selected={level === l.value} className={level === l.value ? 'active' : ''} onClick={() => setLevel(l.value)} title={l.label}>
                <span aria-hidden="true">{l.emoji}</span> <span className="level-seg-label">{l.label}</span>
              </button>
            ))}
          </div>
          <div className="seg" role="tablist" aria-label="Pituus">
            {COUNT_OPTIONS.map(c => (
              <button key={c} role="tab" aria-selected={count === c} className={count === c ? 'active' : ''} onClick={() => setCount(c)}>{c} lippua</button>
            ))}
          </div>
          {!shownRecords ? (
            <p className="muted empty-stats">Ladataan…</p>
          ) : shownRecords.length === 0 ? (
            <p className="muted empty-stats">Ei vielä tuloksia tällä tasolla. Pelaa yksinpeli ja aseta ensimmäinen ennätys!</p>
          ) : (
            <ol className="record-list">
              {shownRecords.map((r, i) => (
                <li key={r.userId} className={r.isMe ? 'me' : ''}>
                  <span className="record-rank">{['🥇', '🥈', '🥉'][i] ?? `${i + 1}.`}</span>
                  <Avatar player={{ userId: r.userId, username: r.username, avatarEmoji: r.avatarEmoji, avatarColor: r.avatarColor, avatarImage: r.avatarImage }} size={30} />
                  <span className="record-name">{r.isMe ? 'Sinä' : r.username}</span>
                  <b className="record-score">{r.best.toLocaleString('fi-FI')}</b>
                </li>
              ))}
            </ol>
          )}
        </section>
      </motion.main>
    </div>
  );
}
