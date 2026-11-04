import { useState } from 'react';
import Modal from './Modal';
import { useAuth } from '../context/AuthContext';
import { enablePush, markPushPrompted } from '../constants/push';

// Kysytään kerran pelivalikossa. Puhelin näyttää oman lupaikkunansa vasta napautuksen jälkeen,
// joten ilmoituksia ei voi kytkeä päälle kysymättä.
export default function PushPrompt({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { token } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  function close() {
    markPushPrompted();
    onClose();
  }

  async function allow() {
    if (!token) return;
    setBusy(true);
    setError('');
    try {
      await enablePush(token);
      close();
    } catch (err) {
      markPushPrompted();
      setError(err instanceof Error ? err.message : 'Ilmoitusten käyttöönotto epäonnistui');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} label="Ilmoitukset" onBackdrop={close}>
      <div className="push-prompt">
        <div className="whats-new-emoji" aria-hidden="true">🔔</div>
        <h2 className="sheet-title">Salli ilmoitukset</h2>
        <p className="sheet-sub">Saat ilmoituksen, kun kaveri kutsuu sinut peliin tai lähettää kaveripyynnön, vaikka BOWL olisi kiinni.</p>
        <p className="faint push-prompt-note">Voit ottaa ilmoitukset pois milloin tahansa Kaverit-sivulta.</p>
        {error && <p className="alert alert-warn">{error}</p>}
        <div className="sheet-actions">
          {error
            ? <button className="btn btn-primary btn-block" onClick={close}>Selvä</button>
            : <button className="btn btn-primary btn-block" onClick={allow} disabled={busy}>{busy ? 'Hetki…' : 'Salli ilmoitukset'}</button>}
          {!error && <button className="btn btn-ghost btn-block" onClick={close}>Ei nyt</button>}
        </div>
      </div>
    </Modal>
  );
}
