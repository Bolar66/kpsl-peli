import type { FlagStatRow, StatsRange } from '../api/profile';
import { LEVELS } from '../constants/flags';

const RANGES: [StatsRange, string][] = [['all', 'Kaikki'], ['last5', '5 peliä'], ['last20', '20 peliä'], ['30d', '30 pv']];

function percent(part: number, total: number) {
  return total > 0 ? Math.round((part / total) * 100) : 0;
}

// Lippuvisan tilastot omaan ja kaverin profiiliin: yhteenveto ja tasoittaiset tulokset ennätyksineen
export default function FlagStatsPanel({ stats, range, onRangeChange, own, loading }: {
  stats: FlagStatRow[];
  range: StatsRange;
  onRangeChange: (range: StatsRange) => void;
  own: boolean;
  loading?: boolean;
}) {
  const total = stats.reduce((acc, r) => ({
    games: acc.games + r.games,
    wins: acc.wins + r.wins,
    correct: acc.correct + r.correct,
    questions: acc.questions + r.questions,
    answerMs: acc.answerMs + (r.avgAnswerMs ?? 0) * r.correct,
  }), { games: 0, wins: 0, correct: 0, questions: 0, answerMs: 0 });
  const avgSeconds = total.correct > 0 ? (total.answerMs / total.correct / 1000).toFixed(1).replace('.', ',') : '–';

  return (
    <div className={`stats-panel ${loading ? 'loading' : ''}`}>
      <div className="seg" role="tablist" aria-label="Aikaväli">
        {RANGES.map(([v, text]) => (
          <button key={v} role="tab" aria-selected={range === v} className={range === v ? 'active' : ''} onClick={() => onRangeChange(v)}>{text}</button>
        ))}
      </div>

      <section className="stat-grid">
        <div className="stat"><span className="stat-num">{total.games}</span><span className="stat-label">Pelejä</span></div>
        <div className="stat"><span className="stat-num accent">{total.wins}</span><span className="stat-label">Moninpelivoittoja</span></div>
        <div className="stat"><span className="stat-num">{percent(total.correct, total.questions)}%</span><span className="stat-label">Oikein</span></div>
        <div className="stat"><span className="stat-num">{avgSeconds}{avgSeconds !== '–' && <small> s</small>}</span><span className="stat-label">Vastausaika</span></div>
      </section>

      <section className="card">
        <div className="section-head"><h2>Tasot</h2><span className="faint">ennätys yksinpelissä</span></div>
        {total.games === 0 ? (
          <p className="muted empty-stats">
            {range !== 'all' ? 'Tällä aikavälillä ei ole lippuvisapelejä.' : own ? 'Pelaa ensimmäinen lippuvisa, niin näet tilastosi täällä.' : 'Ei vielä lippuvisapelejä.'}
          </p>
        ) : (
          <ul className="level-stats">
            {LEVELS.map(l => {
              const row = stats.find(r => r.level === l.value);
              return (
                <li key={l.value} className={row ? '' : 'empty'}>
                  <span className="level-stats-emoji" aria-hidden="true">{l.emoji}</span>
                  <span className="level-stats-main">
                    <b>{l.label}</b>
                    <span className="faint">{row ? `${row.games} ${row.games === 1 ? 'peli' : 'peliä'} · ${percent(row.correct, row.questions)}% oikein` : 'Ei pelattu'}</span>
                  </span>
                  <b className="level-stats-best">{row?.bestSolo != null ? row.bestSolo.toLocaleString('fi-FI') : '–'}</b>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
