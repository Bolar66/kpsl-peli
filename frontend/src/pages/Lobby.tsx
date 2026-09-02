import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useAutoScale } from '../hooks/useAutoScale';
import { createGame, joinGame } from '../api/games';
import './Lobby.css';

export default function Lobby() {
  const { user, token, logout } = useAuth();
  const { containerRef, scale } = useAutoScale<HTMLDivElement>(360, 560);
  const [mode, setMode] = useState('classic');
  const [winsRequired, setWinsRequired] = useState(3);
  const [joinCode, setJoinCode] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();

  async function handleCreate() {
    setError('');
    try {
      const game = await createGame(token!, mode, winsRequired);
      navigate(`/room/${game.room_code}`);
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function handleJoin() {
    setError('');
    try {
      const result = await joinGame(token!, joinCode.toUpperCase());
      navigate(`/room/${result.roomCode}`);
    } catch (err: any) {
      setError(err.message);
    }
  }

  return (
    <div className="lobby-page-outer">
      <div className="lobby-page" ref={containerRef} style={{ transform: `scale(${scale})` }}>
        <div className="lobby-header">
          <span className="lobby-username">👋 {user?.username}</span>
          <button className="btn btn-secondary" onClick={logout}>Kirjaudu ulos</button>
        </div>

        {error && <p className="auth-error">{error}</p>}

        <div className="lobby-card">
          <h2 className="lobby-card-title">Luo huone</h2>
          <div className="lobby-row">
            <span>Moodi</span>
            <select value={mode} onChange={(e) => setMode(e.target.value)}>
              <option value="classic">Klassinen</option>
              <option value="extended">KPSL-Spock</option>
            </select>
          </div>
          <div className="lobby-row">
            <span>Voittoja vaadittu</span>
            <input
              type="number"
              value={winsRequired}
              onChange={(e) => setWinsRequired(parseInt(e.target.value) || 1)}
            />
          </div>
          <button className="btn btn-primary" onClick={handleCreate}>Luo huone</button>
        </div>

        <div className="lobby-card">
          <h2 className="lobby-card-title">Liity huoneeseen</h2>
          <input
            className="lobby-join-input"
            placeholder="ABCD"
            maxLength={4}
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value)}
          />
          <button className="btn btn-primary" onClick={handleJoin}>Liity</button>
        </div>
      </div>
    </div>
  );
}