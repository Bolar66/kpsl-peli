import Modal from './Modal';
import { updateAudioSettings } from '../constants/audioEngine';
import { useAudioSettings } from '../hooks/useAudioSettings';
import { sfx } from '../constants/sound';

function Slider({ label, value, onChange, onRelease, disabled }: {
  label: string; value: number; onChange: (v: number) => void; onRelease?: () => void; disabled: boolean;
}) {
  return (
    <label className="volume-row">
      <span className="volume-label">{label}</span>
      <input
        className="volume-slider"
        type="range"
        min={0}
        max={100}
        step={1}
        value={Math.round(value * 100)}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value) / 100)}
        onPointerUp={onRelease}
        onKeyUp={onRelease}
        style={{ '--fill': `${Math.round(value * 100)}%` } as React.CSSProperties}
        aria-label={label}
      />
      <span className="volume-value">{Math.round(value * 100)}</span>
    </label>
  );
}

// Äänenvoimakkuuden säätö: kaikkien äänten mykistys, musiikki ja efektit erikseen
export default function AudioSettingsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const settings = useAudioSettings();

  return (
    <Modal open={open} label="Äänet" onBackdrop={onClose}>
      <h2 className="sheet-title">Äänet</h2>

      <button
        className={`sound-toggle ${settings.muted ? '' : 'on'}`}
        role="switch"
        aria-checked={!settings.muted}
        onClick={() => updateAudioSettings({ muted: !settings.muted })}
      >
        <span>{settings.muted ? '🔇 Äänet pois' : '🔊 Äänet päällä'}</span>
        <span className="switch"><span /></span>
      </button>

      <Slider
        label="Musiikki"
        value={settings.music}
        disabled={settings.muted}
        onChange={(music) => updateAudioSettings({ music })}
      />
      <Slider
        label="Efektit ja katsomo"
        value={settings.sfx}
        disabled={settings.muted}
        onChange={(v) => updateAudioSettings({ sfx: v })}
        // Kuultava esimerkki säädön jälkeen
        onRelease={() => sfx.pick()}
      />

      <p className="sheet-sub" style={{ marginTop: 0 }}>
        Musiikki: “Lofi again” (omfgdude) ja “Kuia” (cinameng), CC0 · OpenGameArt.org
      </p>
      <button className="btn btn-primary btn-block" onClick={onClose}>Valmis</button>
    </Modal>
  );
}
