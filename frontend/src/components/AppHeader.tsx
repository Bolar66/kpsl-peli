import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Avatar from './Avatar';
import AudioSettingsSheet from './AudioSettings';
import { useAudioSettings } from '../hooks/useAudioSettings';

// Valikkosivujen yläpalkki: vasemmalla sivukohtainen sisältö, oikealla äänet ja oma profiili
export default function AppHeader({ left }: { left: ReactNode }) {
  const { user } = useAuth();
  const audioSettings = useAudioSettings();
  const [audioOpen, setAudioOpen] = useState(false);

  return (
    <>
      <header className="topbar">
        <div className="topbar-left">{left}</div>
        <div className="topbar-actions">
          <button className="icon-btn" onClick={() => setAudioOpen(true)} aria-label="Äänet" title="Äänet">
            {audioSettings.muted ? '🔇' : '🔊'}
          </button>
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
