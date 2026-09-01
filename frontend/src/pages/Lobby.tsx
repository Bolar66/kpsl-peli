import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { createGame, joinGame } from '../api/games';

export default function Lobby() {
  const { user, token, logout } = useAuth();
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
    <div>
      <h1>Lobby</h1>
      <p>Kirjautunut käyttäjänä: {user?.username}</p>
      <button onClick={logout}>Kirjaudu ulos</button>

      {error && <p style={{ color: 'red' }}>{error}</p>}

      <hr />

      <h2>Luo huone</h2>
      <div>
        <label>
          Moodi:
          <select value={mode} onChange={(e) => setMode(e.target.value)}>
            <option value="classic">Klassinen</option>
            <option value="extended">KPSL-Spock</option>
          </select>
        </label>
      </div>
      <div>
        <label>
          Voittoja vaadittu:
          <input
            type="number"
            value={winsRequired}
            onChange={(e) => setWinsRequired(parseInt(e.target.value) || 1)}
          />
        </label>
      </div>
      <button onClick={handleCreate}>Luo huone</button>

      <hr />

      <h2>Liity huoneeseen</h2>
      <input
        placeholder="Huonekoodi"
        value={joinCode}
        onChange={(e) => setJoinCode(e.target.value)}
      />
      <button onClick={handleJoin}>Liity</button>
    </div>
  );
}