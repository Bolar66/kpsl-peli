import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { register } from '../api/auth';
import { useAuth } from '../context/AuthContext';

export default function Register() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const { setAuth } = useAuth();
  const navigate = useNavigate();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    try {
      const data = await register(username, password);
      setAuth(data.token, data.user);
      navigate('/lobby');
    } catch (err: any) {
      setError(err.message);
    }
  }

  return (
    <div>
      <h1>Rekisteröidy</h1>
      <form onSubmit={handleSubmit}>
        <div>
          <input
            placeholder="Käyttäjätunnus"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
        </div>
        <div>
          <input
            type="password"
            placeholder="Salasana"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        {error && <p style={{ color: 'red' }}>{error}</p>}
        <button type="submit">Rekisteröidy</button>
      </form>
      <p>Onko jo tili? <Link to="/login">Kirjaudu</Link></p>
    </div>
  );
}