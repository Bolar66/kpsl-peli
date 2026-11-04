import { useState } from 'react';
import Modal from './Modal';
import { useAuth } from '../context/AuthContext';
import { sendFeedback, type FeedbackCategory } from '../api/feedback';

const MAX_LENGTH = 1000;
const CATEGORIES: { value: FeedbackCategory; label: string }[] = [
  { value: 'bug', label: '🐞 Bugi' },
  { value: 'idea', label: '💡 Idea' },
  { value: 'other', label: '💬 Muu' },
];

// Palaute testaajilta: tyyppi ja vapaa teksti. Laitetiedot lisätään palvelimella automaattisesti.
export default function FeedbackSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { token } = useAuth();
  const [category, setCategory] = useState<FeedbackCategory>('bug');
  const [message, setMessage] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [error, setError] = useState('');

  function close() {
    onClose();
    if (status === 'sent') {
      setStatus('idle');
      setMessage('');
    }
    setError('');
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!token || !message.trim() || status === 'sending') return;
    setStatus('sending');
    setError('');
    try {
      await sendFeedback(token, category, message);
      setStatus('sent');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Palautteen lähetys epäonnistui');
      setStatus('idle');
    }
  }

  return (
    <Modal open={open} label="Anna palautetta" onBackdrop={close}>
      {status === 'sent' ? (
        <>
          <div className="feedback-done" aria-hidden="true">🙌</div>
          <h2 className="sheet-title">Kiitos palautteesta!</h2>
          <p className="sheet-sub">Jokainen bugi ja idea auttaa tekemään pelistä paremman.</p>
          <button className="btn btn-primary btn-block" onClick={close}>Sulje</button>
        </>
      ) : (
        <form onSubmit={submit} className="feedback-form">
          <h2 className="sheet-title">Anna palautetta</h2>
          <p className="sheet-sub">Löysitkö bugin tai keksitkö jotain parannettavaa? Kerro vapaasti.</p>
          <div className="seg" role="radiogroup" aria-label="Palautteen tyyppi">
            {CATEGORIES.map(c => (
              <button
                key={c.value}
                type="button"
                role="radio"
                aria-checked={category === c.value}
                className={category === c.value ? 'active' : ''}
                onClick={() => setCategory(c.value)}
              >
                {c.label}
              </button>
            ))}
          </div>
          <textarea
            className="input feedback-text"
            rows={5}
            maxLength={MAX_LENGTH}
            placeholder={category === 'bug' ? 'Mitä tapahtui ja mitä olit tekemässä?' : 'Kirjoita tähän…'}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            aria-label="Palaute"
          />
          {error && <p className="alert alert-danger" role="alert">{error}</p>}
          <div className="sheet-actions">
            <button className="btn btn-primary btn-block" type="submit" disabled={!message.trim() || status === 'sending'}>
              {status === 'sending' ? 'Lähetetään…' : 'Lähetä palaute'}
            </button>
            <button className="btn btn-ghost btn-block" type="button" onClick={close}>Peruuta</button>
          </div>
        </form>
      )}
    </Modal>
  );
}
