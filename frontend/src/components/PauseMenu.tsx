import { useState, type ReactNode } from 'react';
import Modal from './Modal';
import RulesList from './RulesList';
import type { GameMode } from '../constants/symbols';

interface PauseMenuProps {
  visible: boolean;
  iAmReady: boolean;
  readyCount: number;
  readyTotal: number;
  pausedByName: string | null;
  // Kivi-paperi-saksien säännöt pelimuodon mukaan, tai muun pelin oma sääntöteksti
  mode?: GameMode;
  rules?: ReactNode;
  // Chat ja poistumisen kuvaus ovat moninpeliä varten
  showChat?: boolean;
  exitText?: string;
  resumeNote?: string;
  onToggleReady: () => void;
  onOpenAudio: () => void;
  onOpenChat: () => void;
  unread: number;
  lastMessage: { name: string; text: string } | null;
  onExit: () => void;
}

// Tauko pysäyttää pelin kaikilta; peli jatkuu kun jokainen on kuitannut olevansa valmis
export default function PauseMenu({
  visible, iAmReady, readyCount, readyTotal, pausedByName, mode = 'classic', rules, showChat = true, exitText, resumeNote = 'Kesken jäänyt kierros aloitetaan alusta.', onToggleReady, onOpenAudio, onOpenChat, unread, lastMessage, onExit,
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
          {rules ?? <RulesList mode={mode} />}
          <button className="btn btn-secondary btn-block" onClick={() => setView('menu')}>Takaisin</button>
        </>
      )}

      {view === 'confirm-exit' && (
        <>
          <h2 className="sheet-title">Poistutaanko pelistä?</h2>
          <p className="sheet-sub">{exitText ?? 'Muut jatkavat ilman sinua. Et voi palata kesken käynnissä olevan pelin.'}</p>
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
            {readyTotal > 1 ? `${readyCount}/${readyTotal} valmiina — peli jatkuu kun kaikki ovat valmiita. ` : ''}
            {resumeNote}
          </p>
          {/* Tauon aikana pöydän puhekuplat jäävät valikon alle, joten uusin viesti näytetään tässä */}
          {lastMessage && (
            <button className="pause-last-msg" onClick={onOpenChat}>
              <b>{lastMessage.name}:</b> {lastMessage.text}
            </button>
          )}
          <div className="sheet-actions">
            <button className={`btn btn-block ${iAmReady ? 'btn-secondary' : 'btn-primary'}`} onClick={onToggleReady}>
              {iAmReady ? 'En olekaan valmis' : 'Jatketaan'}
            </button>
            {showChat && (
              <button className="btn btn-secondary btn-block" onClick={onOpenChat}>
                Chat ja emotet{unread > 0 && <span className="unread-inline">{unread > 9 ? '9+' : unread}</span>}
              </button>
            )}
            <button className="btn btn-secondary btn-block" onClick={() => setView('rules')}>Säännöt</button>
            <button className="btn btn-secondary btn-block" onClick={onOpenAudio}>Äänet ja musiikki</button>
            <button className="btn btn-ghost btn-block" onClick={() => setView('confirm-exit')}>Poistu pelistä</button>
          </div>
        </>
      )}
    </Modal>
  );
}
