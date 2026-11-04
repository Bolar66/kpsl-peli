import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Avatar from './Avatar';
import AudioSettingsSheet from './AudioSettings';
import { useAudioSettings } from '../hooks/useAudioSettings';
import { usePresence } from '../context/PresenceContext';

// Valikkosivujen yläpalkki: vasemmalla sivukohtainen sisältö, oikealla äänet ja oma profiili
export default function AppHeader({ left }: { left: ReactNode }) {
  const { user } = useAuth();
  const audioSettings = useAudioSettings();
  const { incomingCount } = usePresence();
  const [audioOpen, setAudioOpen] = useState(false);

  return (
    <>
      <header className="topbar">
        <div className="topbar-left">{left}</div>
        <div className="topbar-actions">
          <button className="icon-btn" onClick={() => setAudioOpen(true)} aria-label="Äänet" title="Äänet">
            {audioSettings.muted ? '🔇' : '🔊'}
          </button>
          <Link
            to="/kaverit"
            className="icon-btn friends-btn"
            aria-label={incomingCount ? `Kaverit, ${incomingCount} uutta pyyntöä` : 'Kaverit'}
            title="Kaverit"
          >
            👥
            {incomingCount > 0 && <span className="unread">{incomingCount > 9 ? '9+' : incomingCount}</span>}
          </Link>
          {user && (
            <Link to="/profile" className="user-chip" aria-label="Oma profiili">
              <span className="user-chip-name">{user.username}</span>
              <Avatar player={{ userId: user.id, username: user.username, avatarEmoji: user.avatarEmoji, avatarColor: user.avatarColor, avatarImage: user.avatarImage }} size={34} />
            </Link>
          )}
        </div>
      </header>
      <AudioSettingsSheet open={audioOpen} onClose={() => setAudioOpen(false)} />
    </>
  );
}
