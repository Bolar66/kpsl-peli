import { useState } from 'react';
import Modal from './Modal';
import RulesList from './RulesList';
import type { GameMode } from '../constants/symbols';

interface PauseMenuProps {
  visible: boolean;
  iAmReady: boolean;
  readyCount: number;
  readyTotal: number;
  pausedByName: string | null;
  mode: GameMode;
  onToggleReady: () => void;
  onExit: () => void;
}

// Tauko pysäyttää pelin kaikilta; peli jatkuu kun jokainen on kuitannut olevansa valmis
export default function PauseMenu({
  visible, iAmReady, readyCount, readyTotal, pausedByName, mode, onToggleReady, onExit,
}: PauseMenuProps) {
  const [view, setView] = useState<'menu' | 'rules' | 'confirm-exit'>('menu');

  // Valikko avautuu aina päänäkymään
  const [wasVisible, setWasVisible] = useState(visible);
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) setView('menu');
  }

  const title = pausedByName ? `${pausedByName} pysäytti pelin` : 'Peli pysäytetty';

  return (
    <Modal open={visible} label={title}>
      {view === 'rules' && (
        <>
          <h2 className="sheet-title">Säännöt</h2>
          <RulesList mode={mode} />
          <button className="btn btn-secondary btn-block" onClick={() => setView('menu')}>Takaisin</button>
        </>
      )}

      {view === 'confirm-exit' && (
        <>
          <h2 className="sheet-title">Poistutaanko pelistä?</h2>
          <p className="sheet-sub">Muut jatkavat ilman sinua. Et voi palata kesken käynnissä olevan pelin.</p>
          <div className="sheet-actions">
            <button className="btn btn-danger btn-block" onClick={onExit}>Poistu pelistä</button>
            <button className="btn btn-secondary btn-block" onClick={() => setView('menu')}>Peruuta</button>
          </div>
        </>
      )}

      {view === 'menu' && (
        <>
          <h2 className="sheet-title">{title}</h2>
          <p className="sheet-sub">
            {readyCount}/{readyTotal} valmiina — peli jatkuu kun kaikki ovat valmiita.
            Kesken jäänyt kierros aloitetaan alusta.
          </p>
          <div className="sheet-actions">
            <button className={`btn btn-block ${iAmReady ? 'btn-secondary' : 'btn-primary'}`} onClick={onToggleReady}>
              {iAmReady ? 'En olekaan valmis' : 'Jatketaan'}
            </button>
            <button className="btn btn-secondary btn-block" onClick={() => setView('rules')}>Säännöt</button>
            <button className="btn btn-ghost btn-block" onClick={() => setView('confirm-exit')}>Poistu pelistä</button>
          </div>
        </>
      )}
    </Modal>
  );
}
