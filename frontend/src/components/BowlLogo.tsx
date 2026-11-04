// BOWL-logo: kulho, jossa on eri pelien merkkejä (pallo, noppa ja rengas).
// Kulhon väri seuraa teemaa (--text), korostukset ovat aksenttiväriä.
export function BowlMark({ size = 40, className }: { size?: number; className?: string }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 96 96" aria-hidden="true">
      <circle cx="31" cy="43" r="11" style={{ fill: 'var(--accent)' }} />
      <g transform="rotate(-14 51 34)">
        <rect x="40" y="23" width="22" height="22" rx="5.5" style={{ fill: 'var(--text)' }} />
        <circle cx="46" cy="29" r="2.4" style={{ fill: 'var(--bg)' }} />
        <circle cx="56" cy="39" r="2.4" style={{ fill: 'var(--bg)' }} />
      </g>
      <circle cx="68" cy="45" r="8" fill="none" style={{ stroke: 'var(--accent)' }} strokeWidth="5" />
      <path d="M10 52H86A38 30 0 0 1 10 52Z" style={{ fill: 'var(--text)' }} />
      <rect x="35" y="83" width="26" height="6" rx="3" style={{ fill: 'var(--text)' }} />
    </svg>
  );
}

export default function BowlLogo({ size = 32 }: { size?: number }) {
  return (
    <span className="bowl-logo" style={{ fontSize: size * 0.72 }}>
      <BowlMark size={size} />
      <span className="wordmark">BOWL</span>
    </span>
  );
}
