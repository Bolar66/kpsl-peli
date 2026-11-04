import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { currentSubscription, disablePush, enablePush, pushSupport } from '../constants/push';

// Ilmoitusasetus Kaverit-sivulla: pelikutsut ja kaveripyynnöt puhelimen ilmoituksina
export default function PushToggle() {
  const { token } = useAuth();
  const support = pushSupport();
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (support !== 'supported') return;
    currentSubscription().then(sub => setEnabled(!!sub && Notification.permission === 'granted')).catch(() => setEnabled(false));
  }, [support]);

  async function toggle() {
    if (!token) return;
    setBusy(true);
    setError('');
    try {
      if (enabled) { await disablePush(token); setEnabled(false); }
      else { await enablePush(token); setEnabled(true); }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ilmoitusten asetus epäonnistui');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card push-card">
      <div className="section-head"><h2>Ilmoitukset</h2></div>
      <p className="muted push-text">Saat ilmoituksen, kun kaveri kutsuu sinut peliin, lähettää kaveripyynnön tai hyväksyy pyyntösi.</p>
      {support === 'supported' && (
        <button className={`btn btn-block ${enabled ? 'btn-secondary' : 'btn-primary'}`} onClick={toggle} disabled={busy || enabled === null}>
          {busy ? 'Hetki…' : enabled ? 'Ilmoitukset päällä — poista käytöstä' : 'Ota ilmoitukset käyttöön'}
        </button>
      )}
      {support === 'needs-install' && (
        <p className="alert alert-warn">iPhonessa ilmoitukset toimivat, kun BOWL on lisätty kotinäytölle. Lisää se Safarin Jaa-valikosta ja avaa peli kotinäytöltä.</p>
      )}
      {support === 'unsupported' && <p className="alert alert-warn">Tämä selain ei tue ilmoituksia.</p>}
      {support === 'dev' && <p className="faint push-text">Ilmoitukset toimivat julkaistussa versiossa.</p>}
      {error && <p className="alert alert-danger" role="alert">{error}</p>}
    </section>
  );
}
