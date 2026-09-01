interface PickButtonsProps {
  mode: 'classic' | 'extended';
  onPick: (symbol: string) => void;
  disabled: boolean;
  hasPicked: boolean;
}

const SYMBOL_INFO: Record<string, { emoji: string; label: string; color: string }> = {
  rock: { emoji: '✊', label: 'Kivi', color: '#FF5470' },
  paper: { emoji: '✋', label: 'Paperi', color: '#00D9C0' },
  scissors: { emoji: '✌️', label: 'Sakset', color: '#FFC857' },
  lizard: { emoji: '🦎', label: 'Lisko', color: '#9D6FFF' },
  spock: { emoji: '🖖', label: 'Spock', color: '#4FA8FF' },
};

export default function PickButtons({ mode, onPick, disabled, hasPicked }: PickButtonsProps) {
  const symbols = mode === 'extended'
    ? ['rock', 'paper', 'scissors', 'lizard', 'spock']
    : ['rock', 'paper', 'scissors'];

  return (
    <div className="pick-buttons">
      {symbols.map(symbol => {
        const info = SYMBOL_INFO[symbol]!;
        return (
          <button
            key={symbol}
            className={`pick-button ${disabled ? 'inactive' : 'active'}`}
            style={disabled ? {} : { borderColor: info.color, color: info.color }}
            onClick={() => onPick(symbol)}
            disabled={disabled}
          >
            <span className="pick-emoji">{info.emoji}</span>
            <span className="pick-label">{info.label}</span>
          </button>
        );
      })}
      {hasPicked && !disabled && <p className="pick-status">Valinta lähetetty, odotetaan muita...</p>}
    </div>
  );
}