import { useState } from 'react';
import { motion } from 'framer-motion';
import type { ProfileStats, StatsRange } from '../api/profile';
import { MODE_LABEL, SYMBOL_INFO, SYMBOLS_BY_MODE } from '../constants/symbols';

function percent(part: number, total: number) {
  return total > 0 ? Math.round((part / total) * 100) : 0;
}

type ModeView = 'all' | 'classic' | 'extended';
type OpponentView = 'all' | 'players' | 'bots';

const RANGES: [StatsRange, string][] = [['all', 'Kaikki'], ['last5', '5 peliä'], ['last20', '20 peliä'], ['30d', '30 pv']];

// Suodattaa tilastot valitun pelimuodon ja vastustajatyypin mukaan ja laskee ne yhteen
function summarize(stats: ProfileStats, view: ModeView, opponents: OpponentView) {
  const matches = (row: { mode: string; vsBots: boolean }) =>
    (view === 'all' || row.mode === view) &&
    (opponents === 'all' || (opponents === 'bots') === row.vsBots);

  const games = stats.games.filter(matches);
  const symbols = new Map<string, { count: number; wins: number; decided: number }>();
  for (const s of stats.symbols.filter(matches)) {
    const prev = symbols.get(s.symbol) ?? { count: 0, wins: 0, decided: 0 };
    symbols.set(s.symbol, { count: prev.count + s.count, wins: prev.wins + s.wins, decided: prev.decided + (s.decided ?? s.count) });
  }
  return {
    games: games.reduce((n, g) => n + g.games, 0),
    wins: games.reduce((n, g) => n + g.wins, 0),
    roundWins: games.reduce((n, g) => n + g.roundWins, 0),
    symbols,
  };
}

function Segmented<T extends string>({ label, options, value, onChange }: {
  label: string; options: [T, string, number?][]; value: T; onChange: (v: T) => void;
}) {
  return (
    <div className="seg" role="tablist" aria-label={label}>
      {options.map(([v, text, count]) => (
        <button key={v} role="tab" aria-selected={value === v} className={value === v ? 'active' : ''} onClick={() => onChange(v)}>
          {text}
          {count !== undefined && <span className="seg-count"> {count}</span>}
        </button>
      ))}
    </div>
  );
}

// Tilastonäkymä omaan ja kaverin profiiliin: aikaväli, pelimuoto, vastustajat, valinnat ja viimeisimmät pelit
export default function StatsPanel({ stats, range, onRangeChange, own, loading }: {
  stats: ProfileStats;
  range: StatsRange;
  onRangeChange: (range: StatsRange) => void;
  own: boolean;
  loading?: boolean;
}) {
  const [view, setView] = useState<ModeView>('all');
  const [opponentView, setOpponentView] = useState<OpponentView>('all');

  const shown = summarize(stats, view, opponentView);
  // Lisko ja Spock näytetään kun katsotaan Lisko–Spock-pelejä, tai kun niitä on pelattu
  const playedExtended = stats.games.some(g => g.mode === 'extended');
  const symbolOrder = view === 'classic' || (view === 'all' && !playedExtended) ? SYMBOLS_BY_MODE.classic : SYMBOLS_BY_MODE.extended;
  const symbolRows = symbolOrder.map(symbol => ({
    symbol, count: shown.symbols.get(symbol)?.count ?? 0, wins: shown.symbols.get(symbol)?.wins ?? 0, decided: shown.symbols.get(symbol)?.decided ?? 0,
  }));
  // Kolme vastustajaa, joita vastaan on eniten pelivoittoja (vain oikeat pelaajat)
  const topOpponents = [...stats.opponents
    .filter(o => view === 'all' || o.mode === view)
    .reduce((map, o) => {
      const prev = map.get(o.username) ?? { username: o.username, games: 0, wins: 0 };
      map.set(o.username, { username: o.username, games: prev.games + o.games, wins: prev.wins + o.wins });
      return map;
    }, new Map<string, { username: string; games: number; wins: number }>())
    .values()]
    .sort((a, b) => b.wins - a.wins || b.games - a.games)
    .slice(0, 3);
  const countFor = (mode: ModeView) => stats.games.filter(g => mode === 'all' || g.mode === mode).reduce((n, g) => n + g.games, 0);
  const recentShown = stats.recent.filter(g =>
    (view === 'all' || g.mode === view) && (opponentView === 'all' || (opponentView === 'bots') === g.vsBots));
  const totalPicks = symbolRows.reduce((sum, r) => sum + r.count, 0);
  const totalRoundWins = symbolRows.reduce((sum, r) => sum + r.wins, 0);
  const totalDecided = symbolRows.reduce((sum, r) => sum + r.decided, 0);
  const favorite = totalPicks > 0 ? [...symbolRows].sort((a, b) => b.count - a.count)[0] : null;

  return (
    <div className={`stats-panel ${loading ? 'loading' : ''}`}>
      <Segmented label="Aikaväli" options={RANGES} value={range} onChange={onRangeChange} />
      <Segmented
        label="Pelimuoto"
        options={[['all', 'Kaikki'], ['classic', MODE_LABEL.classic!, countFor('classic')], ['extended', MODE_LABEL.extended!, countFor('extended')]]}
        value={view}
        onChange={setView}
      />
      <Segmented
        label="Vastustajat"
        options={[['all', 'Kaikki'], ['players', 'Kavereita vastaan'], ['bots', 'Botteja vastaan']]}
        value={opponentView}
        onChange={setOpponentView}
      />

      <section className="stat-grid">
        <div className="stat"><span className="stat-num">{shown.games}</span><span className="stat-label">Pelejä</span></div>
        <div className="stat"><span className="stat-num accent">{shown.wins}</span><span className="stat-label">Voittoja</span></div>
        <div className="stat"><span className="stat-num">{percent(shown.wins, shown.games)}%</span><span className="stat-label">Voitto-%</span></div>
        <div className="stat"><span className="stat-num">{shown.roundWins}</span><span className="stat-label">Kierrosvoittoja</span></div>
      </section>

      <section className="card">
        <div className="section-head">
          <h2>{own ? 'Valintasi' : 'Valinnat'}</h2>
          {favorite && <span className="faint">Suosikki: {SYMBOL_INFO[favorite.symbol]?.emoji} {SYMBOL_INFO[favorite.symbol]?.label}</span>}
        </div>
        {totalPicks === 0 ? (
          <p className="muted empty-stats">
            {range !== 'all'
              ? 'Tällä aikavälillä ei ole pelejä.'
              : view === 'extended'
                ? (own ? 'Et ole vielä pelannut Lisko–Spockia. Kokeile sitä seuraavaksi!' : 'Ei vielä Lisko–Spock-pelejä.')
                : (own ? 'Pelaa ensimmäinen pelisi, niin näet täällä mitä käsiä suosit.' : 'Ei vielä pelattuja pelejä.')}
          </p>
        ) : (
          <ul className="pick-stats">
            {symbolRows.map(r => (
              <li key={r.symbol}>
                <span className="pick-stats-emoji">{SYMBOL_INFO[r.symbol]?.emoji}</span>
                <div className="pick-stats-body">
                  <div className="pick-stats-top">
                    <span>{SYMBOL_INFO[r.symbol]?.label}</span>
                    <span className="faint">{percent(r.count, totalPicks)}% · voitti {percent(r.wins, r.decided)}%</span>
                  </div>
                  <div className="score-bar">
                    <motion.div
                      className="score-fill"
                      style={{ background: favorite?.symbol === r.symbol ? 'var(--accent)' : undefined }}
                      initial={{ width: 0 }}
                      animate={{ width: `${percent(r.count, totalPicks)}%` }}
                      transition={{ duration: 0.6, ease: [0.2, 0.8, 0.2, 1] }}
                    />
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
        {totalDecided > 0 && (
          <p className="faint pick-stats-foot">{totalDecided} ratkaistua kierrosta, joista voitti {percent(totalRoundWins, totalDecided)}%</p>
        )}
      </section>

      {own && opponentView !== 'bots' && (
        <section className="card">
          <div className="section-head">
            <h2>Eniten voittoja vastaan</h2>
            <span className="faint">kaverit</span>
          </div>
          {topOpponents.length === 0 ? (
            <p className="muted empty-stats">Pelaa kavereita vastaan, niin näet täällä ketä vastaan voitat useimmin.</p>
          ) : (
            <ol className="opponents">
              {topOpponents.map((o, i) => (
                <li key={o.username}>
                  <span className="opponent-rank">{['🥇', '🥈', '🥉'][i]}</span>
                  <span className="opponent-name">{o.username}</span>
                  <span className="opponent-score">
                    <b>{o.wins}</b> voittoa <span className="faint">/ {o.games} peliä</span>
                  </span>
                </li>
              ))}
            </ol>
          )}
        </section>
      )}

      {recentShown.length > 0 && (
        <section className="card">
          <div className="section-head"><h2>Viimeisimmät pelit</h2></div>
          <ul className="recent-list">
            {recentShown.map(g => (
              <li key={g.id}>
                <span className={`result-pill ${g.won ? 'won' : ''}`}>{g.won ? 'Voitto' : 'Häviö'}</span>
                <span className="recent-main">
                  {MODE_LABEL[g.mode] ?? g.mode}{g.vsBots ? ' · botit' : ''}
                  <span className="faint"> · {g.myWins}/{g.winsRequired}{!g.won && g.winner ? ` · voittaja ${g.winner}` : ''}</span>
                </span>
                <span className="faint recent-date">{new Date(g.playedAt).toLocaleDateString('fi-FI', { day: 'numeric', month: 'numeric' })}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
