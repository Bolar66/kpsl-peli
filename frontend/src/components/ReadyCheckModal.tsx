import Modal from './Modal';
import RulesList from './RulesList';
import { MODE_LABEL, type GameMode } from '../constants/symbols';
import Avatar, { type AvatarData } from './Avatar';

type ReadyPlayer = AvatarData;

interface ReadyCheckModalProps {
  visible: boolean;
  reason: 'game-start' | 'round-gap' | 'manual-pause' | null;
  pausedByName: string | null;
  readyNames: string[];
  players: ReadyPlayer[];
  myUsername: string;
  mode: GameMode;
  winsRequired: number;
  onReady: () => void;
}

export default function ReadyCheckModal({
  visible, reason, pausedByName, readyNames, players, myUsername, mode, winsRequired, onReady,
}: ReadyCheckModalProps) {
  const iAmReady = readyNames.includes(myUsername);
  const isStart = reason === 'game-start';

  let title = 'Valmiina?';
  if (isStart) title = 'Peli alkaa';
  if (reason === 'round-gap') title = 'Seuraava kierros';
  if (reason === 'manual-pause') title = pausedByName ? `${pausedByName} pysäytti pelin` : 'Peli pysäytetty';

  return (
    <Modal open={visible} label={title}>
      <h2 className="sheet-title">{title}</h2>
      <p className="sheet-sub">
        {MODE_LABEL[mode]} · {winsRequired} {winsRequired === 1 ? 'voitto' : 'voittoa'} voittaa
      </p>

      <ul className="ready-list">
        {players.map(p => {
          const ready = readyNames.includes(p.username);
          return (
            <li key={p.userId} className={ready ? 'ready' : ''}>
              <Avatar player={p} size={28} />
              <span className="ready-name">{p.username === myUsername ? 'Sinä' : p.username}</span>
              <span className="ready-state">{ready ? '✓ Valmis' : 'Odottaa'}</span>
            </li>
          );
        })}
      </ul>

      <button className="btn btn-primary btn-block" onClick={onReady} disabled={iAmReady}>
        {iAmReady ? 'Odotetaan muita…' : 'Olen valmis'}
      </button>

      {isStart && (
        <div className="hearts-explainer">
          <span className="lives" aria-hidden="true"><span className="life" /><span className="life" /><span className="life" /></span>
          <p>
            Jokaisella on <b>3 sydäntä</b>. Jos et valitse ajoissa, menetät sydämen. Kun sydämet loppuvat,
            häviät kierroksen automaattisesti.
          </p>
        </div>
      )}

      {isStart && (
        <section className="ready-rules">
          <p className="eyebrow">Säännöt</p>
          <RulesList mode={mode} />
        </section>
      )}
    </Modal>
  );
}
