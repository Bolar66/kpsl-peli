interface CountdownRingProps {
  countdown: number;
  duration: number;
}

function getColor(fraction: number): string {
  if (fraction <= 0.2) return '#FF5470';
  if (fraction <= 0.4) return '#FFC857';
  return '#00D9C0';
}

export default function CountdownRing({ countdown, duration }: CountdownRingProps) {
  const fraction = Math.max(countdown / duration, 0);
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - fraction);
  const color = getColor(fraction);

  return (
    <div className="countdown-ring-wrapper">
      <svg width="96" height="96" viewBox="0 0 96 96">
        <circle
          cx="48" cy="48" r={radius}
          fill="none" stroke="#2D2D44" strokeWidth="6"
        />
        <circle
          cx="48" cy="48" r={radius}
          fill="none" stroke={color} strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform="rotate(-90 48 48)"
          style={{ transition: 'stroke-dashoffset 1s linear, stroke 0.3s ease' }}
        />
      </svg>
      <div className="countdown-ring-number" style={{ color }}>{countdown}</div>
    </div>
  );
}