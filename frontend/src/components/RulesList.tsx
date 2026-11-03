import KpslDiagram from './KpslDiagram';
import { SYMBOL_INFO, rulesForMode, type GameMode } from '../constants/symbols';

export default function RulesList({ mode }: { mode: GameMode }) {
  const rules = rulesForMode(mode);
  return (
    <div className="rules">
      {mode === 'extended' && <KpslDiagram />}
      <ul className="rules-list">
        {rules.map(r => (
          <li key={`${r.from}-${r.to}`}>
            <span className="rule-emoji">{SYMBOL_INFO[r.from]!.emoji}</span>
            <span>
              <b>{SYMBOL_INFO[r.from]!.label}</b> {r.verb} <span className="muted">{r.object}</span>
            </span>
            <span className="rule-emoji faded">{SYMBOL_INFO[r.to]!.emoji}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
