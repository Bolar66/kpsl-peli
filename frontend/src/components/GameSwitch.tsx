export type StatsGame = 'kpsl' | 'flags';

// Profiilin tilastojen pelivalinta
export default function GameSwitch({ value, onChange }: { value: StatsGame; onChange: (game: StatsGame) => void }) {
  return (
    <div className="seg game-switch" role="tablist" aria-label="Peli">
      <button role="tab" aria-selected={value === 'kpsl'} className={value === 'kpsl' ? 'active' : ''} onClick={() => onChange('kpsl')}>✊ Kivi, paperi, sakset</button>
      <button role="tab" aria-selected={value === 'flags'} className={value === 'flags' ? 'active' : ''} onClick={() => onChange('flags')}>🌍 Lippuvisa</button>
    </div>
  );
}
