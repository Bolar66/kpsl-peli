import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '../context/AuthContext';
import { AuthError } from '../api/games';
import { deleteMyAccount, getMyProfile, setPassword, updateMyProfile, type Profile as ProfileData, type ProfileStats } from '../api/profile';
import Avatar from '../components/Avatar';
import ProfileEditor from '../components/ProfileEditor';
import Modal from '../components/Modal';
import { MODE_LABEL, SYMBOL_INFO, SYMBOLS_BY_MODE } from '../constants/symbols';
import './Lobby.css';
import './Profile.css';

function percent(part: number, total: number) {
  return total > 0 ? Math.round((part / total) * 100) : 0;
}

type StatsView = 'all' | 'classic' | 'extended';
type OpponentView = 'all' | 'players' | 'bots';

// Suodattaa tilastot valitun pelimuodon ja vastustajatyypin mukaan ja laskee ne yhteen
function summarize(stats: ProfileStats, view: StatsView, opponents: OpponentView) {
  const matches = (row: { mode: string; vsBots: boolean }) =>
    (view === 'all' || row.mode === view) &&
    (opponents === 'all' || (opponents === 'bots') === row.vsBots);

  const games = stats.games.filter(matches);
  const symbols = new Map<string, { count: number; wins: number }>();
  for (const s of stats.symbols.filter(matches)) {
    const prev = symbols.get(s.symbol) ?? { count: 0, wins: 0 };
    symbols.set(s.symbol, { count: prev.count + s.count, wins: prev.wins + s.wins });
  }
  return {
    games: games.reduce((n, g) => n + g.games, 0),
    wins: games.reduce((n, g) => n + g.wins, 0),
    roundWins: games.reduce((n, g) => n + g.roundWins, 0),
    symbols,
  };
}

export default function Profile() {
  const { token, user, setAuth, logout } = useAuth();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [stats, setStats] = useState<ProfileStats | null>(null);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [view, setView] = useState<StatsView>('all');
  const [opponentView, setOpponentView] = useState<OpponentView>('all');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    setDeleting(true);
    try {
      await deleteMyAccount(token!);
      logout();
    } catch (err) {
      setDeleting(false);
      setConfirmDelete(false);
      handleError(err);
    }
  }

  const handleError = useCallback((err: unknown) => {
    if (err instanceof AuthError) { logout(); return; }
    setError(err instanceof Error ? err.message : 'Jokin meni pieleen');
  }, [logout]);

  useEffect(() => {
    if (!token) return;
    getMyProfile(token)
      .then(data => { setProfile(data.profile); setStats(data.stats); })
      .catch(handleError);
  }, [token, handleError]);

  async function handleSave(changes: Parameters<typeof updateMyProfile>[1]) {
    const data = await updateMyProfile(token!, changes);
    setProfile(data.profile);
    // Nimimerkki on mukana kirjautumistunnisteessa, joten otetaan uusi tunniste käyttöön
    setAuth(data.token, {
      id: data.profile.id,
      username: data.profile.username,
      avatarEmoji: data.profile.avatarEmoji,
      avatarColor: data.profile.avatarColor,
      avatarImage: data.profile.avatarImage,
    });
  }

  const shown = stats ? summarize(stats, view, opponentView) : null;
  // Lisko ja Spock näytetään kun katsotaan Lisko–Spock-pelejä, tai kun niitä on pelattu
  const playedExtended = !!stats && stats.games.some(g => g.mode === 'extended');
  const symbolOrder = view === 'classic' || (view === 'all' && !playedExtended) ? SYMBOLS_BY_MODE.classic : SYMBOLS_BY_MODE.extended;
  const symbolRows = shown
    ? symbolOrder.map(symbol => ({ symbol, count: shown.symbols.get(symbol)?.count ?? 0, wins: shown.symbols.get(symbol)?.wins ?? 0 }))
    : [];
  // Kolme vastustajaa, joita vastaan on eniten pelivoittoja (vain oikeat pelaajat)
  const topOpponents = stats
    ? [...stats.opponents
        .filter(o => view === 'all' || o.mode === view)
        .reduce((map, o) => {
          const prev = map.get(o.username) ?? { username: o.username, games: 0, wins: 0 };
          map.set(o.username, { username: o.username, games: prev.games + o.games, wins: prev.wins + o.wins });
          return map;
        }, new Map<string, { username: string; games: number; wins: number }>())
        .values()]
        .sort((a, b) => b.wins - a.wins || b.games - a.games)
        .slice(0, 3)
    : [];
  const countFor = (mode: StatsView) => stats?.games.filter(g => mode === 'all' || g.mode === mode).reduce((n, g) => n + g.games, 0) ?? 0;
  const recentShown = stats?.recent.filter(g =>
    (view === 'all' || g.mode === view) && (opponentView === 'all' || (opponentView === 'bots') === g.vsBots)) ?? [];
  const totalPicks = symbolRows.reduce((sum, r) => sum + r.count, 0);
  const totalRoundWins = symbolRows.reduce((sum, r) => sum + r.wins, 0);
  const favorite = totalPicks > 0 ? [...symbolRows].sort((a, b) => b.count - a.count)[0] : null;

  const displayed = profile ?? (user ? { id: user.id, username: user.username, isGuest: false, avatarEmoji: user.avatarEmoji ?? null, avatarColor: user.avatarColor ?? null, avatarImage: user.avatarImage ?? null, createdAt: '' } : null);

  return (
    <div className="lobby-page">
      <header className="topbar">
        <button className="icon-btn" onClick={() => navigate('/pelit')} aria-label="Takaisin">←</button>
        <span className="eyebrow">Profiili</span>
        <span style={{ width: 40 }} />
      </header>

      <motion.main
        className="lobby-main"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: [0.2, 0.8, 0.2, 1] }}
      >
        {error && <p className="alert alert-danger" role="alert">{error}</p>}

        {displayed && (
          <section className="profile-hero">
            <Avatar player={{ userId: displayed.id, username: displayed.username, avatarEmoji: displayed.avatarEmoji, avatarColor: displayed.avatarColor, avatarImage: displayed.avatarImage }} size={96} />
            <h1>{displayed.username}</h1>
            {profile?.isGuest && <span className="badge">Vieras</span>}
            <button className="btn btn-secondary btn-sm" onClick={() => setEditing(true)} disabled={!profile}>Muokkaa profiilia</button>
          </section>
        )}

        {profile?.isGuest && (
          <section className="card guest-card">
            <p className="eyebrow">Tallenna profiilisi</p>
            <p className="muted">
              Pelaat vieraana. Lisää salasana, niin voit kirjautua myöhemmin millä tahansa laitteella ja tilastosi säilyvät.
            </p>
            <button className="btn btn-primary btn-block" onClick={() => setPasswordOpen(true)}>Lisää salasana</button>
          </section>
        )}

        {stats && shown && (
          <>
            <div className="seg" role="tablist" aria-label="Pelimuoto">
              {([['all', 'Kaikki'], ['classic', MODE_LABEL.classic], ['extended', MODE_LABEL.extended]] as [StatsView, string][]).map(([value, label]) => (
                <button
                  key={value}
                  role="tab"
                  aria-selected={view === value}
                  className={view === value ? 'active' : ''}
                  onClick={() => setView(value)}
                >
                  {label}
                  {value !== 'all' && <span className="seg-count"> {countFor(value)}</span>}
                </button>
              ))}
            </div>

            <div className="seg" role="tablist" aria-label="Vastustajat">
              {([['all', 'Kaikki'], ['players', 'Kavereita vastaan'], ['bots', 'Botteja vastaan']] as [OpponentView, string][]).map(([value, label]) => (
                <button
                  key={value}
                  role="tab"
                  aria-selected={opponentView === value}
                  className={opponentView === value ? 'active' : ''}
                  onClick={() => setOpponentView(value)}
                >
                  {label}
                </button>
              ))}
            </div>

            <section className="stat-grid">
              <div className="stat"><span className="stat-num">{shown.games}</span><span className="stat-label">Pelejä</span></div>
              <div className="stat"><span className="stat-num accent">{shown.wins}</span><span className="stat-label">Voittoja</span></div>
              <div className="stat"><span className="stat-num">{percent(shown.wins, shown.games)}%</span><span className="stat-label">Voitto-%</span></div>
              <div className="stat"><span className="stat-num">{shown.roundWins}</span><span className="stat-label">Kierrosvoittoja</span></div>
            </section>

            <section className="card">
              <div className="section-head">
                <h2>Valintasi</h2>
                {favorite && <span className="faint">Suosikki: {SYMBOL_INFO[favorite.symbol]?.emoji} {SYMBOL_INFO[favorite.symbol]?.label}</span>}
              </div>
              {totalPicks === 0 ? (
                <p className="muted empty-stats">
                  {view === 'extended'
                    ? 'Et ole vielä pelannut Lisko–Spockia. Kokeile sitä seuraavaksi!'
                    : 'Pelaa ensimmäinen pelisi, niin näet täällä mitä käsiä suosit.'}
                </p>
              ) : (
                <ul className="pick-stats">
                  {symbolRows.map(r => (
                    <li key={r.symbol}>
                      <span className="pick-stats-emoji">{SYMBOL_INFO[r.symbol]?.emoji}</span>
                      <div className="pick-stats-body">
                        <div className="pick-stats-top">
                          <span>{SYMBOL_INFO[r.symbol]?.label}</span>
                          <span className="faint">{percent(r.count, totalPicks)}% · voitti {percent(r.wins, r.count)}%</span>
                        </div>
                        <div className="score-bar">
                          <motion.div
                            className="score-fill"
                            style={{ background: favorite?.symbol === r.symbol ? 'var(--accent)' : undefined }}
                            initial={{ width: 0 }}
                            animate={{ width: `${percent(r.count, totalPicks)}%` }}
                            transition={{ duration: 0.6, ease: [0.2, 0.8, 0.2, 1] }}
                          />
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              {totalPicks > 0 && (
                <p className="faint pick-stats-foot">{totalPicks} ratkaistua kierrosta, joista voitit {percent(totalRoundWins, totalPicks)}%</p>
              )}
            </section>

            {opponentView !== 'bots' && (
              <section className="card">
                <div className="section-head">
                  <h2>Eniten voittoja vastaan</h2>
                  <span className="faint">kaverit</span>
                </div>
                {topOpponents.length === 0 ? (
                  <p className="muted empty-stats">Pelaa kavereita vastaan, niin näet täällä ketä vastaan voitat useimmin.</p>
                ) : (
                  <ol className="opponents">
                    {topOpponents.map((o, i) => (
                      <li key={o.username}>
                        <span className="opponent-rank">{['🥇', '🥈', '🥉'][i]}</span>
                        <span className="opponent-name">{o.username}</span>
                        <span className="opponent-score">
                          <b>{o.wins}</b> voittoa <span className="faint">/ {o.games} peliä</span>
                        </span>
                      </li>
                    ))}
                  </ol>
                )}
              </section>
            )}

            {recentShown.length > 0 && (
              <section className="card">
                <div className="section-head"><h2>Viimeisimmät pelit</h2></div>
                <ul className="recent-list">
                  {recentShown.map(g => (
                    <li key={g.id}>
                      <span className={`result-pill ${g.won ? 'won' : ''}`}>{g.won ? 'Voitto' : 'Häviö'}</span>
                      <span className="recent-main">
                        {MODE_LABEL[g.mode] ?? g.mode}{g.vsBots ? ' · botit' : ''}
                        <span className="faint"> · {g.myWins}/{g.winsRequired}{!g.won && g.winner ? ` · voittaja ${g.winner}` : ''}</span>
                      </span>
                      <span className="faint recent-date">{new Date(g.playedAt).toLocaleDateString('fi-FI', { day: 'numeric', month: 'numeric' })}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}

        {!stats && !error && <p className="muted">Ladataan…</p>}

        <section className="profile-actions">
          {profile && !profile.isGuest && (
            <button className="btn btn-secondary btn-block" onClick={() => setPasswordOpen(true)}>Vaihda salasana</button>
          )}
          <button className="btn btn-ghost btn-block" onClick={() => (profile?.isGuest ? setConfirmLogout(true) : logout())}>
            Kirjaudu ulos
          </button>
          <div className="profile-links">
            <Link to="/tietosuoja">Tietosuojaseloste</Link>
            <button className="link-danger" onClick={() => setConfirmDelete(true)}>Poista tili</button>
          </div>
        </section>
      </motion.main>

      {profile && <ProfileEditor open={editing} profile={profile} onClose={() => setEditing(false)} onSave={handleSave} />}

      {profile && (
        <PasswordSheet
          open={passwordOpen}
          isGuest={profile.isGuest}
          onClose={() => setPasswordOpen(false)}
          onSubmit={async (password, current) => {
            const data = await setPassword(token!, password, current);
            setProfile(data.profile);
          }}
        />
      )}

      <Modal open={confirmDelete} label="Poista tili" onBackdrop={() => !deleting && setConfirmDelete(false)}>
        <h2 className="sheet-title">Poistetaanko tili?</h2>
        <p className="sheet-sub">Tilisi, profiilikuvasi, pelihistoriasi ja tilastosi poistetaan pysyvästi. Tätä ei voi perua.</p>
        <div className="sheet-actions">
          <button className="btn btn-danger btn-block" onClick={handleDelete} disabled={deleting}>
            {deleting ? 'Poistetaan…' : 'Poista tili pysyvästi'}
          </button>
          <button className="btn btn-ghost btn-block" onClick={() => setConfirmDelete(false)} disabled={deleting}>Peruuta</button>
        </div>
      </Modal>

      <Modal open={confirmLogout} label="Kirjaudu ulos" onBackdrop={() => setConfirmLogout(false)}>
        <h2 className="sheet-title">Kirjaudutaanko ulos?</h2>
        <p className="sheet-sub">Pelaat vieraana ilman salasanaa. Jos kirjaudut ulos, et pääse tähän profiiliin ja tilastoihin enää takaisin.</p>
        <div className="sheet-actions">
          <button className="btn btn-primary btn-block" onClick={() => { setConfirmLogout(false); setPasswordOpen(true); }}>Lisää ensin salasana</button>
          <button className="btn btn-danger btn-block" onClick={logout}>Kirjaudu silti ulos</button>
          <button className="btn btn-ghost btn-block" onClick={() => setConfirmLogout(false)}>Peruuta</button>
        </div>
      </Modal>
    </div>
  );
}

function PasswordSheet({ open, isGuest, onClose, onSubmit }: {
  open: boolean; isGuest: boolean; onClose: () => void; onSubmit: (password: string, current?: string) => Promise<void>;
}) {
  const [password, setPasswordValue] = useState('');
  const [current, setCurrent] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [saving, setSaving] = useState(false);

  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) { setPasswordValue(''); setCurrent(''); setError(''); setDone(false); }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await onSubmit(password, isGuest ? undefined : current);
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Jokin meni pieleen');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} label="Salasana" onBackdrop={onClose}>
      {done ? (
        <>
          <h2 className="sheet-title">{isGuest ? 'Profiili tallennettu' : 'Salasana vaihdettu'}</h2>
          <p className="sheet-sub">{isGuest ? 'Voit nyt kirjautua nimimerkilläsi ja salasanallasi millä tahansa laitteella.' : 'Käytä uutta salasanaa seuraavalla kirjautumisella.'}</p>
          <button className="btn btn-primary btn-block" onClick={onClose}>Selvä</button>
        </>
      ) : (
        <form className="auth-form" onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <h2 className="sheet-title">{isGuest ? 'Lisää salasana' : 'Vaihda salasana'}</h2>
          {!isGuest && (
            <label className="field">
              <span className="field-label">Nykyinen salasana</span>
              <input className="input" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} required />
            </label>
          )}
          <label className="field">
            <span className="field-label">{isGuest ? 'Salasana' : 'Uusi salasana'}</span>
            <input className="input" type="password" autoComplete="new-password" placeholder="vähintään 6 merkkiä" value={password} onChange={(e) => setPasswordValue(e.target.value)} required minLength={6} />
          </label>
          {error && <p className="alert alert-danger" role="alert">{error}</p>}
          <div className="sheet-actions">
            <button className="btn btn-primary btn-block" type="submit" disabled={saving}>{saving ? 'Tallennetaan…' : 'Tallenna'}</button>
            <button className="btn btn-ghost btn-block" type="button" onClick={onClose}>Peruuta</button>
          </div>
        </form>
      )}
    </Modal>
  );
}
