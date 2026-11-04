const NODE_RADIUS = 24;

const NODES = [
  { key: 'rock', label: 'Kivi', emoji: '✊', color: 'var(--accent-line)' },
  { key: 'spock', label: 'Spock', emoji: '🖖', color: 'var(--accent-line)' },
  { key: 'paper', label: 'Paperi', emoji: '✋', color: 'var(--accent-line)' },
  { key: 'lizard', label: 'Lisko', emoji: '🦎', color: 'var(--accent-line)' },
  { key: 'scissors', label: 'Sakset', emoji: '✌️', color: 'var(--accent-line)' },
];

const EDGES: [string, string][] = [
  ['rock', 'scissors'], ['rock', 'lizard'],
  ['paper', 'rock'], ['paper', 'spock'],
  ['scissors', 'paper'], ['scissors', 'lizard'],
  ['lizard', 'spock'], ['lizard', 'paper'],
  ['spock', 'scissors'], ['spock', 'rock'],
];

const CENTER = { x: 140, y: 140 };
const RADIUS = 100;

function getPos(index: number) {
  const angle = (-90 + index * 72) * (Math.PI / 180);
  return { x: CENTER.x + RADIUS * Math.cos(angle), y: CENTER.y + RADIUS * Math.sin(angle) };
}

function trimByDistance(a: { x: number; y: number }, b: { x: number; y: number }, startGap: number, endGap: number) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const dist = Math.sqrt(dx * dx + dy * dy) || 1;
  const ux = dx / dist, uy = dy / dist;
  return {
    x1: a.x + ux * startGap,
    y1: a.y + uy * startGap,
    x2: b.x - ux * endGap,
    y2: b.y - uy * endGap,
  };
}

export default function KpslDiagram() {
  const posByKey: Record<string, { x: number; y: number }> = {};
  NODES.forEach((n, i) => { posByKey[n.key] = getPos(i); });
  const colorByKey: Record<string, string> = {};
  NODES.forEach(n => { colorByKey[n.key] = n.color; });

  return (
    <svg viewBox="-34 -6 348 296" width="100%" style={{ maxWidth: 260, margin: '0 auto', display: 'block' }}>
      <defs>
        {NODES.map(n => (
          <marker key={n.key} id={`arrow-${n.key}`} markerWidth="7" markerHeight="7" refX="5" refY="3.5" orient="auto">
            <path d="M0,0 L7,3.5 L0,7 Z" fill={n.color} />
          </marker>
        ))}
      </defs>

      {EDGES.map(([from, to], i) => {
        const line = trimByDistance(posByKey[from]!, posByKey[to]!, NODE_RADIUS + 3, NODE_RADIUS + 9);
        return (
          <line
            key={i}
            x1={line.x1} y1={line.y1} x2={line.x2} y2={line.y2}
            stroke={colorByKey[from]}
            strokeWidth="1.5"
            opacity="0.45"
            markerEnd={`url(#arrow-${from})`}
          />
        );
      })}

      {NODES.map((n, i) => {
        const pos = getPos(i);
        const ux = (pos.x - CENTER.x) / RADIUS;
        const uy = (pos.y - CENTER.y) / RADIUS;
        const labelX = pos.x + ux * (NODE_RADIUS + 16);
        const labelY = pos.y + uy * (NODE_RADIUS + 16) + (uy < -0.3 ? -2 : uy > 0.3 ? 8 : 4);

        return (
          <g key={n.key}>
            <circle cx={pos.x} cy={pos.y} r={NODE_RADIUS} style={{ fill: 'var(--surface-2)', stroke: 'var(--border-strong)' }} strokeWidth="1" />
            <text x={pos.x} y={pos.y + 6} textAnchor="middle" fontSize="18">{n.emoji}</text>
            <text x={labelX} y={labelY} textAnchor="middle" fontSize="11" style={{ fill: 'var(--text-2)' }} fontFamily="Inter, sans-serif">
              {n.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}