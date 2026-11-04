import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '../context/AuthContext';
import { usePresence } from '../context/PresenceContext';
import { AuthError, createGame } from '../api/games';
import { getMyProfile, regenerateFriendCode, type Profile } from '../api/profile';
import {
  acceptFriendRequest, formatFriendCode, getFriends, lookupFriendCode, removeFriend, sendFriendRequest,
  type FriendLists, type FriendUser, type Presence, type Relation,
} from '../api/friends';
import AppHeader from '../components/AppHeader';
import Avatar from '../components/Avatar';
import Modal from '../components/Modal';
import PushToggle from '../components/PushToggle';
import './Lobby.css';
import './Friends.css';

const CODE_CHARS = /[^ABCDEFGHJKMNPQRSTUVWXYZ23456789]/g;
const PRESENCE_LABEL: Record<Presence, string> = { playing: 'Pelaa nyt', online: 'Paikalla', offline: 'Ei paikalla' };

function UserRow({ user, presence, children, to }: { user: FriendUser; presence?: Presence; children?: React.ReactNode; to?: string }) {
  const body = (
    <>
      <span className={`friend-avatar ${presence ?? ''}`}>
        <Avatar player={{ userId: user.id, username: user.username, avatarEmoji: user.avatarEmoji, avatarColor: user.avatarColor, avatarImage: user.avatarImage }} size={40} />
      </span>
      <span className="friend-main">
        <b>{user.username}</b>
        {presence && <span className={`presence ${presence}`}>{PRESENCE_LABEL[presence]}</span>}
      </span>
    </>
  );
  return (
    <li className="friend-row">
      {to ? <Link to={to} className="friend-link">{body}</Link> : <span className="friend-link">{body}</span>}
      {children && <span className="friend-actions">{children}</span>}
    </li>
  );
}

export default function Friends() {
  const { token, logout } = useAuth();
  const { version, refresh } = usePresence();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [lists, setLists] = useState<FriendLists | null>(null);
  const [error, setError] = useState('');
  const [code, setCode] = useState('');
  // Hakutulos muistaa koodin, jolla se haettiin, jotta vanha tulos ei näy koodin muututtua
  const [lookup, setLookup] = useState<{ code: string; result?: { user: FriendUser; relation: Relation }; error?: string } | null>(null);
  const found = lookup?.code === code ? lookup.result ?? null : null;
  const lookupError = lookup?.code === code ? lookup.error ?? '' : '';
  const [busy, setBusy] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [confirmNewCode, setConfirmNewCode] = useState(false);

  const handleError = useCallback((err: unknown) => {
    if (err instanceof AuthError) { logout(); return; }
    setError(err instanceof Error ? err.message : 'Jokin meni pieleen');
  }, [logout]);

  useEffect(() => {
    if (!token) return;
    getMyProfile(token, 'last5').then(d => setProfile(d.profile)).catch(handleError);
  }, [token, handleError]);

  useEffect(() => {
    if (!token || !profile || profile.isGuest) return;
    getFriends(token).then(setLists).catch(handleError);
  }, [token, profile, version, handleError]);

  // Haku käynnistyy, kun koodissa on kuusi merkkiä
  useEffect(() => {
    if (!token || code.length !== 6) return;
    let cancelled = false;
    lookupFriendCode(token, code)
      .then(result => { if (!cancelled) setLookup({ code, result }); })
      .catch(err => { if (!cancelled) setLookup({ code, error: err instanceof Error ? err.message : 'Haku epäonnistui' }); });
    return () => { cancelled = true; };
  }, [token, code]);

  async function run(key: string, action: () => Promise<unknown>) {
    setBusy(key);
    setError('');
    try {
      await action();
      refresh();
    } catch (err) {
      handleError(err);
    } finally {
      setBusy(null);
    }
  }

  async function sendRequest() {
    await run('send', async () => {
      const result = await sendFriendRequest(token!, code);
      setLookup(prev => prev?.result ? { ...prev, result: { ...prev.result, relation: result.relation } } : prev);
    });
  }

  async function inviteToNewRoom(friend: FriendUser) {
    await run(`invite-${friend.id}`, async () => {
      const game = await createGame(token!, 'classic', 3);
      // Kutsu lähetetään, kun olet itse liittynyt huoneeseen (Room hoitaa)
      navigate(`/room/${game.room_code}`, { state: { inviteFriendId: friend.id } });
    });
  }

  async function copyCode() {
    if (!profile?.friendCode) return;
    const text = formatFriendCode(profile.friendCode);
    try {
      if (navigator.share) {
        await navigator.share({ title: 'BOWL', text: `Lisää minut kaveriksi BOWLissa! Kaverikoodini: ${text}\n${window.location.origin}` });
      } else {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    } catch { /* jako peruttiin */ }
  }

  async function newCode() {
    setConfirmNewCode(false);
    await run('code', async () => {
      const { friendCode } = await regenerateFriendCode(token!);
      setProfile(p => p && { ...p, friendCode });
    });
  }

  const relationText: Record<Relation, string> = {
    none: '', self: 'Tämä on sinun koodisi', friends: 'Olette jo kavereita', outgoing: 'Pyyntö lähetetty', incoming: '',
  };

  return (
    <div className="lobby-page">
      <AppHeader left={<Link to="/pelit" className="back-link"><span aria-hidden="true">←</span> Pelit</Link>} />

      <motion.main
        className="lobby-main"
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.2, 0.8, 0.2, 1] }}
      >
        <div className="lobby-hero"><h1>Kaverit</h1></div>
        {error && <p className="alert alert-danger" role="alert">{error}</p>}

        {profile?.isGuest && (
          <section className="card guest-card">
            <p className="eyebrow">Kaverit vaativat tunnuksen</p>
            <p className="muted">Pelaat vieraana. Lisää salasana profiilissa, niin saat oman kaverikoodin ja voit lisätä kavereita.</p>
            <Link to="/profile" className="btn btn-primary btn-block">Lisää salasana</Link>
          </section>
        )}

        {profile && !profile.isGuest && (
          <>
            <section className="card code-card">
              <p className="eyebrow">Sinun kaverikoodisi</p>
              <div className="my-code">{profile.friendCode ? formatFriendCode(profile.friendCode) : '…'}</div>
              <div className="code-actions">
                <button className="btn btn-primary" onClick={copyCode}>{copied ? 'Kopioitu ✓' : 'Jaa koodi'}</button>
                <button className="btn btn-ghost btn-sm" onClick={() => setConfirmNewCode(true)} disabled={busy === 'code'}>Vaihda koodi</button>
              </div>
            </section>

            <section className="card add-card">
              <p className="eyebrow">Lisää kaveri</p>
              <input
                className="input code-input"
                placeholder="K7M-4QX"
                inputMode="text"
                autoCapitalize="characters"
                autoComplete="off"
                spellCheck={false}
                aria-label="Kaverin koodi"
                value={code.length > 3 ? `${code.slice(0, 3)}-${code.slice(3)}` : code}
                onChange={(e) => setCode(e.target.value.toUpperCase().replace(CODE_CHARS, '').slice(0, 6))}
              />
              {lookupError && <p className="faint add-hint">{lookupError}</p>}
              {found && (
                <ul className="friend-list">
                  <UserRow user={found.user}>
                    {found.relation === 'none' || found.relation === 'incoming' ? (
                      <button className="btn btn-primary btn-sm" onClick={sendRequest} disabled={busy === 'send'}>
                        {found.relation === 'incoming' ? 'Hyväksy' : 'Lähetä pyyntö'}
                      </button>
                    ) : (
                      <span className="faint add-status">{relationText[found.relation]}</span>
                    )}
                  </UserRow>
                </ul>
              )}
            </section>

            {lists && lists.incoming.length > 0 && (
              <section className="card">
                <div className="section-head"><h2>Kaveripyynnöt</h2><span className="count-badge">{lists.incoming.length}</span></div>
                <ul className="friend-list">
                  {lists.incoming.map(u => (
                    <UserRow key={u.id} user={u}>
                      <button className="btn btn-primary btn-sm" onClick={() => run(`accept-${u.id}`, () => acceptFriendRequest(token!, u.id))} disabled={busy === `accept-${u.id}`}>Hyväksy</button>
                      <button className="icon-btn small" onClick={() => run(`decline-${u.id}`, () => removeFriend(token!, u.id))} aria-label={`Hylkää ${u.username}`}>✕</button>
                    </UserRow>
                  ))}
                </ul>
              </section>
            )}

            <section className="card">
              <div className="section-head">
                <h2>Kaverisi</h2>
                {lists && <span className="faint">{lists.friends.filter(f => f.presence !== 'offline').length} paikalla</span>}
              </div>
              {!lists ? (
                <p className="muted empty-stats">Ladataan…</p>
              ) : lists.friends.length === 0 ? (
                <p className="muted empty-stats">Ei vielä kavereita. Jaa koodisi tai lisää kaveri hänen koodillaan.</p>
              ) : (
                <ul className="friend-list">
                  {lists.friends.map(f => (
                    <UserRow key={f.id} user={f} presence={f.presence} to={`/pelaaja/${f.id}`}>
                      <button className="btn btn-secondary btn-sm" onClick={() => inviteToNewRoom(f)} disabled={busy === `invite-${f.id}`}>
                        Kutsu peliin
                      </button>
                    </UserRow>
                  ))}
                </ul>
              )}
            </section>

            {lists && lists.outgoing.length > 0 && (
              <section className="card">
                <div className="section-head"><h2>Odottaa vastausta</h2></div>
                <ul className="friend-list">
                  {lists.outgoing.map(u => (
                    <UserRow key={u.id} user={u}>
                      <button className="btn btn-ghost btn-sm" onClick={() => run(`cancel-${u.id}`, () => removeFriend(token!, u.id))}>Peru</button>
                    </UserRow>
                  ))}
                </ul>
              </section>
            )}

            <PushToggle />
          </>
        )}
      </motion.main>

      <Modal open={confirmNewCode} label="Vaihda kaverikoodi" onBackdrop={() => setConfirmNewCode(false)}>
        <h2 className="sheet-title">Vaihdetaanko koodi?</h2>
        <p className="sheet-sub">Saat uuden kaverikoodin, eikä vanha toimi enää. Nykyiset kaverisi säilyvät.</p>
        <div className="sheet-actions">
          <button className="btn btn-primary btn-block" onClick={newCode}>Vaihda koodi</button>
          <button className="btn btn-ghost btn-block" onClick={() => setConfirmNewCode(false)}>Peruuta</button>
        </div>
      </Modal>
    </div>
  );
}
