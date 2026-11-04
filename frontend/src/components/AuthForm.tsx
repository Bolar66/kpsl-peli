import { useEffect, useState } from 'react';
import { BowlMark } from './BowlLogo';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { login, playAsGuest, register, requestPasswordReset } from '../api/auth';
import { useAuth } from '../context/AuthContext';
import '../pages/Auth.css';

type AuthMode = 'guest' | 'login' | 'register' | 'forgot';

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
  const [email, setEmail] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { token, setAuth } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  // Jos käyttäjä avasi huonelinkin kirjautumatta, palataan siihen kirjautumisen jälkeen
  const from = (location.state as { from?: string } | null)?.from || '/pelit';
  const comingToRoom = from.startsWith('/room/');

  useEffect(() => {
    if (token) navigate(from, { replace: true });
  }, [token, navigate, from]);

  function switchMode(next: AuthMode) {
    setMode(next);
    setError('');
    setNotice('');
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    setError('');
    setLoading(true);
    try {
      const name = username.trim();
      if (mode === 'forgot') {
        const result = await requestPasswordReset(name);
        setNotice(result.message);
        return;
      }
      const data = mode === 'guest'
        ? await playAsGuest(name)
        : mode === 'login' ? await login(name, password) : await register(name, password, email.trim());
      setAuth(data.token, data.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Tuntematon virhe');
    } finally {
      setLoading(false);
    }
  }

  const submitLabel = mode === 'guest' ? (comingToRoom ? 'Liity peliin' : 'Pelaa')
    : mode === 'login' ? 'Kirjaudu'
    : mode === 'forgot' ? 'Lähetä palautuslinkki'
    : 'Luo tunnus';

  return (
    <div className="auth-page">
      <motion.div
        className="auth-hero"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.2, 0.8, 0.2, 1] }}
      >
        <BowlMark size={88} className="auth-mark" />
        <div className="wordmark">BOWL</div>
        <p className="auth-tagline">
          {comingToRoom ? 'Sinut on kutsuttu peliin! Valitse nimimerkki niin pääset mukaan.' : 'Pelejä kavereiden kanssa, reaaliajassa.'}
        </p>
      </motion.div>

      <motion.div
        className="card auth-card"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.08, ease: [0.2, 0.8, 0.2, 1] }}
      >
        {mode === 'forgot' ? (
          <div>
            <h1 className="auth-title">Unohtuiko salasana?</h1>
            <p className="muted" style={{ fontSize: 14, marginTop: 6 }}>
              Kirjoita nimimerkkisi tai sähköpostisi. Jos tunnukseen on liitetty sähköposti, lähetämme sinne linkin uuden salasanan asettamiseen.
            </p>
          </div>
        ) : (
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
        )}

        <form className="auth-form" onSubmit={handleSubmit}>
          <label className="field">
            <span className="field-label">
              {mode === 'guest' ? 'Nimimerkki' : mode === 'forgot' ? 'Nimimerkki tai sähköposti' : 'Käyttäjätunnus'}
            </span>
            <input
              className="input"
              autoComplete={mode === 'guest' ? 'nickname' : 'username'}
              autoCapitalize="off"
              maxLength={mode === 'forgot' ? 254 : 20}
              placeholder={mode === 'guest' ? 'Miten muut näkevät sinut?' : mode === 'register' ? '3–20 merkkiä' : 'nimimerkki'}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              autoFocus
            />
          </label>
          {mode === 'register' && (
            <label className="field">
              <span className="field-label">Sähköposti <span className="faint">(valinnainen, salasanan palautukseen)</span></span>
              <input
                className="input"
                type="email"
                autoComplete="email"
                placeholder="nimi@esimerkki.fi"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
          )}
          {(mode === 'login' || mode === 'register') && (
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
          {mode === 'login' && (
            <button type="button" className="text-link" onClick={() => switchMode('forgot')}>Unohditko salasanan?</button>
          )}
          {error && <p className="alert alert-danger" role="alert">{error}</p>}
          {notice && <p className="alert alert-success" role="status">{notice}</p>}
          <button type="submit" className="btn btn-primary btn-block" disabled={loading}>
            {loading ? 'Hetki…' : submitLabel}
          </button>
        </form>
        {mode === 'forgot' ? (
          <button type="button" className="text-link center" onClick={() => switchMode('login')}>← Takaisin kirjautumiseen</button>
        ) : (
          <p className="auth-switch">
            {mode === 'guest'
              ? 'Ei salasanaa tarvita. Tunnuksella tilastosi säilyvät myös muilla laitteilla.'
              : 'Tunnuksella voit kirjautua millä tahansa laitteella.'}
          </p>
        )}
      </motion.div>
      <p className="legal-note">
        Jatkamalla hyväksyt, että nimimerkkisi ja pelitietosi tallennetaan pelin toimintaa varten.{' '}
        <Link to="/tietosuoja">Tietosuojaseloste</Link>
      </p>
    </div>
  );
}
