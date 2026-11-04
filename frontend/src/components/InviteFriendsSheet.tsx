import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Modal from './Modal';
import Avatar from './Avatar';
import { useAuth } from '../context/AuthContext';
import { getFriends, inviteFriend, type FriendLists } from '../api/friends';
import '../pages/Friends.css';

const PRESENCE_LABEL = { playing: 'Pelaa nyt', online: 'Paikalla', offline: 'Ei paikalla' };

// Pelihuoneen aulasta kutsutaan kavereita: kaveri saa ilmoituksen, josta pääsee suoraan huoneeseen
export default function InviteFriendsSheet({ open, onClose, roomCode, memberIds }: {
  open: boolean; onClose: () => void; roomCode: string; memberIds: number[];
}) {
  const { token } = useAuth();
  const [lists, setLists] = useState<FriendLists | null>(null);
  const [error, setError] = useState('');
  const [invited, setInvited] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState<number | null>(null);

  useEffect(() => {
    if (!open || !token) return;
    let cancelled = false;
    getFriends(token)
      .then(l => { if (!cancelled) { setLists(l); setError(''); } })
      .catch(err => { if (!cancelled) setError(err instanceof Error ? err.message : 'Kavereita ei voitu hakea'); });
    return () => { cancelled = true; };
  }, [open, token]);

  async function invite(userId: number) {
    setBusy(userId);
    try {
      await inviteFriend(token!, userId, roomCode);
      setInvited(prev => new Set(prev).add(userId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kutsu epäonnistui');
    } finally {
      setBusy(null);
    }
  }

  return (
    <Modal open={open} label="Kutsu kavereita" onBackdrop={onClose}>
      <h2 className="sheet-title">Kutsu kavereita</h2>
      {error && <p className="alert alert-warn">{error}</p>}
      {lists && lists.friends.length === 0 && (
        <p className="sheet-sub">Sinulla ei ole vielä kavereita. <Link to="/kaverit">Lisää kavereita</Link> kaverikoodilla.</p>
      )}
      {lists && lists.friends.length > 0 && (
        <ul className="friend-list invite-list">
          {lists.friends.map(f => {
            const inRoom = memberIds.includes(f.id);
            return (
              <li key={f.id} className="friend-row">
                <span className="friend-link">
                  <span className={`friend-avatar ${f.presence}`}>
                    <Avatar player={{ userId: f.id, username: f.username, avatarEmoji: f.avatarEmoji, avatarColor: f.avatarColor, avatarImage: f.avatarImage }} size={40} />
                  </span>
                  <span className="friend-main">
                    <b>{f.username}</b>
                    <span className={`presence ${f.presence}`}>{PRESENCE_LABEL[f.presence]}</span>
                  </span>
                </span>
                <span className="friend-actions">
                  {inRoom ? (
                    <span className="faint">Huoneessa</span>
                  ) : invited.has(f.id) ? (
                    <span className="invited">Kutsuttu ✓</span>
                  ) : (
                    <button className="btn btn-primary btn-sm" onClick={() => invite(f.id)} disabled={busy === f.id}>Kutsu</button>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      )}
      {!lists && !error && <p className="sheet-sub">Ladataan…</p>}
      <button className="btn btn-ghost btn-block" onClick={onClose}>Sulje</button>
    </Modal>
  );
}
