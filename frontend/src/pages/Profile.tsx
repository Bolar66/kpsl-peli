import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '../context/AuthContext';
import { AuthError } from '../api/games';
import { deleteMyAccount, getMyProfile, setPassword, updateMyProfile, type FlagStatRow, type Profile as ProfileData, type ProfileStats, type StatsRange } from '../api/profile';
import FlagStatsPanel from '../components/FlagStatsPanel';
import GameSwitch, { type StatsGame } from '../components/GameSwitch';
import ProfileEditor from '../components/ProfileEditor';
import ProfileHeader from '../components/ProfileHeader';
import StatsPanel from '../components/StatsPanel';
import Modal from '../components/Modal';
import { setThemePreference, useThemePreference, type ThemePreference } from '../constants/theme';
import './Lobby.css';
import './Profile.css';

const THEME_OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: 'system', label: 'Automaattinen' },
  { value: 'dark', label: 'Tumma' },
  { value: 'light', label: 'Vaalea' },
];

export default function Profile() {
  const { token, user, setAuth, logout } = useAuth();
  const theme = useThemePreference();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [stats, setStats] = useState<ProfileStats | null>(null);
  const [flagStats, setFlagStats] = useState<FlagStatRow[] | null>(null);
  const [game, setGame] = useState<StatsGame>('kpsl');
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [range, setRange] = useState<StatsRange>('all');
  const [loadingStats, setLoadingStats] = useState(false);
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
    let cancelled = false;
    getMyProfile(token, range)
      .then(data => { if (!cancelled) { setProfile(data.profile); setStats(data.stats); setFlagStats(data.flagStats); } })
      .catch(handleError)
      .finally(() => { if (!cancelled) setLoadingStats(false); });
    return () => { cancelled = true; };
  }, [token, range, handleError]);

  function changeRange(next: StatsRange) {
    setLoadingStats(true);
    setRange(next);
  }

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

  const displayed = profile ?? (user ? { id: user.id, username: user.username, avatarEmoji: user.avatarEmoji ?? null, avatarColor: user.avatarColor ?? null, avatarImage: user.avatarImage ?? null } : null);

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
          <ProfileHeader user={profile ?? displayed} badge={profile?.isGuest ? <span className="badge">Vieras</span> : undefined}>
            <button className="btn btn-secondary btn-sm" onClick={() => setEditing(true)} disabled={!profile}>Muokkaa profiilia</button>
          </ProfileHeader>
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

        {stats && <GameSwitch value={game} onChange={setGame} />}
        {stats && game === 'kpsl' && <StatsPanel stats={stats} range={range} onRangeChange={changeRange} own loading={loadingStats} />}
        {flagStats && game === 'flags' && <FlagStatsPanel stats={flagStats} range={range} onRangeChange={changeRange} own loading={loadingStats} />}

        {!stats && !error && <p className="muted">Ladataan…</p>}

        <section className="card theme-card">
          <div className="section-head"><h2>Ulkoasu</h2></div>
          <div className="seg" role="radiogroup" aria-label="Teema">
            {THEME_OPTIONS.map(o => (
              <button
                key={o.value}
                type="button"
                role="radio"
                aria-checked={theme === o.value}
                className={theme === o.value ? 'active' : ''}
                onClick={() => setThemePreference(o.value)}
              >
                {o.label}
              </button>
            ))}
          </div>
          <p className="faint theme-note">Automaattinen seuraa puhelimen tumma/vaalea-asetusta.</p>
        </section>

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
