import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { login, playAsGuest, register } from '../api/auth';
import { useAuth } from '../context/AuthContext';
import '../pages/Auth.css';

type AuthMode = 'guest' | 'login' | 'register';

interface AuthFormProps {
  initialMode: AuthMode;
}

const MODE_TABS: { value: AuthMode; label: string }[] = [
  { value: 'guest', label: 'Pelaa heti' },
  { value: 'login', label: 'Kirjaudu' },
  { value: 'register', label: 'Luo tunnus' },
];

// Yhteinen pohja vieraana pelaamiselle, kirjautumiselle ja rekisteröitymiselle
export default function AuthForm({ initialMode }: AuthFormProps) {
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { token, setAuth } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  // Jos käyttäjä avasi huonelinkin kirjautumatta, palataan siihen kirjautumisen jälkeen
  const from = (location.state as { from?: string } | null)?.from || '/lobby';
  const comingToRoom = from.startsWith('/room/');

  useEffect(() => {
    if (token) navigate(from, { replace: true });
  }, [token, navigate, from]);

  function switchMode(next: AuthMode) {
    setMode(next);
    setError('');
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    setError('');
    setLoading(true);
    try {
      const name = username.trim();
      const data = mode === 'guest'
        ? await playAsGuest(name)
        : mode === 'login' ? await login(name, password) : await register(name, password);
      setAuth(data.token, data.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Tuntematon virhe');
    } finally {
      setLoading(false);
    }
  }

  const submitLabel = mode === 'guest' ? (comingToRoom ? 'Liity peliin' : 'Pelaa') : mode === 'login' ? 'Kirjaudu' : 'Luo tunnus';

  return (
    <div className="auth-page">
      <motion.div
        className="auth-hero"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.2, 0.8, 0.2, 1] }}
      >
        <div className="auth-hands" aria-hidden="true">
          <span>✊</span><span>✋</span><span>✌️</span><span>🦎</span><span>🖖</span>
        </div>
        <div className="wordmark">KPSL<span>.</span></div>
        <p className="auth-tagline">
          {comingToRoom ? 'Sinut on kutsuttu peliin! Valitse nimimerkki niin pääset mukaan.' : 'Kivi, paperi, sakset — tai Lisko–Spock. Kavereiden kanssa, reaaliajassa.'}
        </p>
      </motion.div>

      <motion.div
        className="card auth-card"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.08, ease: [0.2, 0.8, 0.2, 1] }}
      >
        <div className="seg" role="tablist">
          {MODE_TABS.map(t => (
            <button
              key={t.value}
              type="button"
              role="tab"
              aria-selected={mode === t.value}
              className={mode === t.value ? 'active' : ''}
              onClick={() => switchMode(t.value)}
            >
              {t.label}
            </button>
          ))}
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>
          <label className="field">
            <span className="field-label">{mode === 'guest' ? 'Nimimerkki' : 'Käyttäjätunnus'}</span>
            <input
              className="input"
              autoComplete={mode === 'guest' ? 'nickname' : 'username'}
              autoCapitalize="off"
              maxLength={20}
              placeholder={mode === 'guest' ? 'Miten muut näkevät sinut?' : mode === 'register' ? '3–20 merkkiä' : 'nimimerkki'}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              autoFocus
            />
          </label>
          {mode !== 'guest' && (
            <label className="field">
              <span className="field-label">Salasana</span>
              <input
                className="input"
                type="password"
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                placeholder={mode === 'login' ? '••••••' : 'vähintään 6 merkkiä'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </label>
          )}
          {error && <p className="alert alert-danger" role="alert">{error}</p>}
          <button type="submit" className="btn btn-primary btn-block" disabled={loading}>
            {loading ? 'Hetki…' : submitLabel}
          </button>
        </form>
        <p className="auth-switch">
          {mode === 'guest'
            ? 'Ei salasanaa tarvita. Tunnuksella tilastosi säilyvät myös muilla laitteilla.'
            : 'Tunnuksella voit kirjautua millä tahansa laitteella.'}
        </p>
      </motion.div>
    </div>
  );
}
