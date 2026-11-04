import { useState } from 'react';
import BowlLogo from '../components/BowlLogo';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { resetPassword } from '../api/auth';
import './Auth.css';

// Sivu, jolle sähköpostin palautuslinkki ohjaa: uuden salasanan asetus
export default function ResetPassword() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) { setError('Salasanat eivät täsmää'); return; }
    setError('');
    setLoading(true);
    try {
      await resetPassword(token, password);
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Jokin meni pieleen');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-page">
      <BowlLogo size={40} />
      <div className="card auth-card">
        {done ? (
          <>
            <h1 className="auth-title">Salasana vaihdettu</h1>
            <p className="muted">Voit nyt kirjautua uudella salasanalla.</p>
            <button className="btn btn-primary btn-block" onClick={() => navigate('/login')}>Kirjaudu</button>
          </>
        ) : !token ? (
          <>
            <h1 className="auth-title">Linkki on virheellinen</h1>
            <p className="muted">Pyydä uusi palautuslinkki kirjautumissivulta.</p>
            <Link className="btn btn-secondary btn-block" to="/login">Kirjautumissivulle</Link>
          </>
        ) : (
          <form className="auth-form" onSubmit={handleSubmit}>
            <h1 className="auth-title">Uusi salasana</h1>
            <label className="field">
              <span className="field-label">Uusi salasana</span>
              <input className="input" type="password" autoComplete="new-password" placeholder="vähintään 6 merkkiä"
                value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} autoFocus />
            </label>
            <label className="field">
              <span className="field-label">Toista salasana</span>
              <input className="input" type="password" autoComplete="new-password"
                value={confirm} onChange={(e) => setConfirm(e.target.value)} required minLength={6} />
            </label>
            {error && <p className="alert alert-danger" role="alert">{error}</p>}
            <button type="submit" className="btn btn-primary btn-block" disabled={loading}>
              {loading ? 'Tallennetaan…' : 'Aseta salasana'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
