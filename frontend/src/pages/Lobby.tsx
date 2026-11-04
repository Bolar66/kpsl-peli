import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '../context/AuthContext';
import { AuthError, createGame, joinGame } from '../api/games';
import AppHeader from '../components/AppHeader';
import './Lobby.css';

const ROOM_CODE_CHARS = /[^ABCDEFGHJKLMNPQRSTUVWXYZ23456789]/g;

export default function Lobby() {
  const { token, logout } = useAuth();
  const [joinCode, setJoinCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<'create' | 'join' | null>(null);
  const navigate = useNavigate();

  function handleError(err: unknown) {
    if (err instanceof AuthError) { logout(); return; }
    setError(err instanceof Error ? err.message : 'Tuntematon virhe');
  }

  async function handleCreate() {
    if (busy) return;
    setError('');
    setBusy('create');
    try {
      const game = await createGame(token!, 'classic', 3);
      navigate(`/room/${game.room_code}`);
    } catch (err) {
      handleError(err);
      setBusy(null);
    }
  }

  async function handleJoin(e: React.FormEvent) {
    e.preventDefault();
    if (busy || joinCode.length !== 4) return;
    setError('');
    setBusy('join');
    try {
      const result = await joinGame(token!, joinCode);
      navigate(`/room/${result.roomCode}`);
    } catch (err) {
      handleError(err);
      setBusy(null);
    }
  }

  return (
    <div className="lobby-page">
      <AppHeader
        left={
          <Link to="/pelit" className="back-link" aria-label="Takaisin pelivalikkoon">
            <span aria-hidden="true">←</span> Pelit
          </Link>
        }
      />

      <motion.main
        className="lobby-main"
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.2, 0.8, 0.2, 1] }}
      >
        <div className="lobby-hero">
          <h1>Kivi, paperi, sakset</h1>
          <p className="muted">Luo huone ja jaa koodi kavereille, tai liity kaverin huoneeseen.</p>
        </div>

        {error && <p className="alert alert-danger" role="alert">{error}</p>}

        <section className="card lobby-card">
          <div>
            <p className="eyebrow">Uusi peli</p>
            <h2 className="lobby-card-title">Luo huone</h2>
            <p className="muted lobby-card-text">Valitse klassinen tai Lisko–Spock. Saat 4-merkkisen koodin, jolla 1–3 kaveria pääsee mukaan.</p>
          </div>
          <button className="btn btn-primary btn-block" onClick={handleCreate} disabled={busy !== null}>
            {busy === 'create' ? 'Luodaan…' : 'Luo huone'}
          </button>
        </section>

        <section className="card lobby-card">
          <div>
            <p className="eyebrow">Onko sinulla koodi?</p>
            <h2 className="lobby-card-title">Liity huoneeseen</h2>
          </div>
          <form className="join-form" onSubmit={handleJoin}>
            <input
              className="input code-input"
              placeholder="ABCD"
              maxLength={4}
              inputMode="text"
              autoCapitalize="characters"
              autoComplete="off"
              spellCheck={false}
              aria-label="Huonekoodi"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase().replace(ROOM_CODE_CHARS, '').slice(0, 4))}
            />
            <button className="btn btn-secondary" type="submit" disabled={busy !== null || joinCode.length !== 4}>
              {busy === 'join' ? 'Liitytään…' : 'Liity'}
            </button>
          </form>
        </section>

        <ol className="how-to">
          <li><span>1</span>Kaikki valitsevat käden ennen kuin aika loppuu</li>
          <li><span>2</span>Kädet paljastetaan yhtä aikaa — tasapelissä uusitaan</li>
          <li><span>3</span>Myöhästyminen vie sydämen. Ensin tavoitteeseen voittaa</li>
        </ol>

      </motion.main>
    </div>
  );
}
