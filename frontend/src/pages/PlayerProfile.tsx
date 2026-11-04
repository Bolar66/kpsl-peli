import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '../context/AuthContext';
import { usePresence } from '../context/PresenceContext';
import { AuthError, createGame } from '../api/games';
import { getFriendProfile, removeFriend, type HeadToHead, type PublicProfile } from '../api/friends';
import type { ProfileStats, StatsRange } from '../api/profile';
import AppHeader from '../components/AppHeader';
import Avatar from '../components/Avatar';
import Modal from '../components/Modal';
import ProfileHeader from '../components/ProfileHeader';
import StatsPanel from '../components/StatsPanel';
import './Lobby.css';
import './Profile.css';
import './Friends.css';

const PRESENCE_LABEL = { playing: 'Pelaa nyt', online: 'Paikalla', offline: 'Ei paikalla' };

// Kaverin julkinen profiili: taustakuva, bio, keskinäiset ottelut ja tilastot aikaväleittäin
export default function PlayerProfile() {
  const { userId } = useParams();
  const id = Number(userId);
  const { token, user, logout } = useAuth();
  const { refresh } = usePresence();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [stats, setStats] = useState<ProfileStats | null>(null);
  const [headToHead, setHeadToHead] = useState<HeadToHead | null>(null);
  const [range, setRange] = useState<StatsRange>('all');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [busy, setBusy] = useState(false);

  const handleError = useCallback((err: unknown) => {
    if (err instanceof AuthError) { logout(); return; }
    setError(err instanceof Error ? err.message : 'Jokin meni pieleen');
  }, [logout]);

  useEffect(() => {
    if (!token || !Number.isInteger(id)) return;
    let cancelled = false;
    getFriendProfile(token, id, range)
      .then(d => { if (!cancelled) { setProfile(d.profile); setStats(d.stats); setHeadToHead(d.headToHead); } })
      .catch(handleError)
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [token, id, range, handleError]);

  async function invite() {
    setBusy(true);
    try {
      const game = await createGame(token!, 'classic', 3);
      navigate(`/room/${game.room_code}`, { state: { inviteFriendId: id } });
    } catch (err) {
      handleError(err);
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      await removeFriend(token!, id);
      refresh();
      navigate('/kaverit', { replace: true });
    } catch (err) {
      handleError(err);
      setBusy(false);
    }
  }

  return (
    <div className="lobby-page">
      <AppHeader left={<Link to="/kaverit" className="back-link"><span aria-hidden="true">←</span> Kaverit</Link>} />

      <motion.main
        className="lobby-main"
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.2, 0.8, 0.2, 1] }}
      >
        {error && <p className="alert alert-danger" role="alert">{error}</p>}
        {!profile && !error && <p className="muted">Ladataan…</p>}

        {profile && (
          <>
            <ProfileHeader user={profile} badge={<span className={`presence ${profile.presence}`}>{PRESENCE_LABEL[profile.presence]}</span>}>
              <button className="btn btn-primary btn-sm" onClick={invite} disabled={busy}>Kutsu peliin</button>
            </ProfileHeader>

            {headToHead && user && (
              <section className="card h2h-card">
                <div className="section-head"><h2>Keskinäiset ottelut</h2><span className="faint">{headToHead.games} peliä</span></div>
                {headToHead.games === 0 ? (
                  <p className="muted empty-stats">Ette ole vielä pelanneet toisianne vastaan. Kutsu {profile.username} peliin!</p>
                ) : (
                  <div className="h2h">
                    <div className={`h2h-side ${headToHead.myWins >= headToHead.theirWins ? 'lead' : ''}`}>
                      <Avatar player={{ userId: user.id, username: user.username, avatarEmoji: user.avatarEmoji, avatarColor: user.avatarColor, avatarImage: user.avatarImage }} size={40} />
                      <b>{headToHead.myWins}</b>
                      <span className="faint">Sinä</span>
                    </div>
                    <span className="h2h-vs">–</span>
                    <div className={`h2h-side ${headToHead.theirWins >= headToHead.myWins ? 'lead' : ''}`}>
                      <Avatar player={{ userId: profile.id, username: profile.username, avatarEmoji: profile.avatarEmoji, avatarColor: profile.avatarColor, avatarImage: profile.avatarImage }} size={40} />
                      <b>{headToHead.theirWins}</b>
                      <span className="faint">{profile.username}</span>
                    </div>
                  </div>
                )}
              </section>
            )}

            {stats && (
              <StatsPanel
                stats={stats}
                range={range}
                onRangeChange={(next) => { setLoading(true); setRange(next); }}
                own={false}
                loading={loading}
              />
            )}

            <button className="btn btn-ghost btn-block remove-friend" onClick={() => setConfirmRemove(true)}>Poista kavereista</button>
          </>
        )}
      </motion.main>

      <Modal open={confirmRemove} label="Poista kaveri" onBackdrop={() => setConfirmRemove(false)}>
        <h2 className="sheet-title">Poistetaanko {profile?.username} kavereista?</h2>
        <p className="sheet-sub">Ette näe enää toistenne profiileja. Kaveriksi voi lisätä myöhemmin uudelleen koodilla.</p>
        <div className="sheet-actions">
          <button className="btn btn-danger btn-block" onClick={remove} disabled={busy}>Poista kavereista</button>
          <button className="btn btn-ghost btn-block" onClick={() => setConfirmRemove(false)}>Peruuta</button>
        </div>
      </Modal>
    </div>
  );
}
