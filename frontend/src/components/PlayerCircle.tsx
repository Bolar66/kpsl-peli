import type { ReactNode } from 'react';
import PlayerHand from './PlayerHand';
import CountdownRing from './CountdownRing';
import Avatar, { type AvatarData } from './Avatar';

interface CirclePlayer extends AvatarData {
  hearts: number;
  isMe: boolean;
  isBot: boolean;
  isConnected: boolean;
  hasPicked: boolean;
  isDnf: boolean;
  isWinner: boolean;
  revealedSymbol: string | null;
}

interface PlayerCircleProps {
  players: CirclePlayer[];
  countdown: number | null;
  duration: number;
  paused: boolean;
  isRevealPhase: boolean;
  revealContent?: ReactNode;
}

const MAX_HEARTS = 3;

// Oma pelaaja on aina alhaalla, muut jakautuvat tasaisesti ympyrälle
function angleFor(index: number, count: number) {
  return 180 + (360 / count) * index;
}

export default function PlayerCircle({ players, countdown, duration, paused, isRevealPhase, revealContent }: PlayerCircleProps) {
  const meIndex = Math.max(players.findIndex(p => p.isMe), 0);
  const ordered = [...players.slice(meIndex), ...players.slice(0, meIndex)];

  return (
    <div className="arena">
      <div className="arena-ring" aria-hidden="true" />
      <div className="arena-center">
        {paused ? (
          <div className="countdown-paused" aria-label="Tauolla">❙❙</div>
        ) : countdown !== null ? (
          <CountdownRing countdown={countdown} duration={duration} />
        ) : isRevealPhase ? revealContent : (
          <div className="countdown-idle" />
        )}
      </div>

      {ordered.map((player, i) => {
        const angle = angleFor(i, ordered.length);
        const rad = (angle - 90) * (Math.PI / 180);
        // Sijainti prosentteina, jotta ympyrä skaalautuu näytön koon mukaan
        const x = 50 + Math.cos(rad) * 38;
        const y = 50 + Math.sin(rad) * 38;
        const isTop = y < 45;
        const status = !player.isConnected && !player.isBot ? 'Yhdistää…' : player.isBot ? 'Botti' : null;

        return (
          <div
            key={player.userId}
            className={[
              'seat',
              isTop ? 'top' : '',
              player.hasPicked ? 'picked' : '',
              player.isDnf ? 'dnf' : '',
              player.isMe ? 'me' : '',
              player.isWinner ? 'winner' : '',
            ].join(' ')}
            style={{ left: `${x}%`, top: `${y}%` }}
          >
            <PlayerHand
              hasPicked={player.hasPicked}
              revealedSymbol={player.revealedSymbol}
              isRevealPhase={isRevealPhase}
              isDnf={player.isDnf}
              isWinner={player.isWinner}
            />
            <div className="seat-info">
              <div className="seat-avatar">
                <Avatar player={player} size={40} />
              </div>
              <div className="seat-name">{player.isMe ? 'Sinä' : player.username}</div>
              {status && <div className="seat-status">{status}</div>}
              <div
                className="lives"
                aria-label={`${player.hearts} sydäntä jäljellä`}
                title={`${player.hearts}/${MAX_HEARTS} sydäntä — myöhästyminen vie yhden`}
              >
                {Array.from({ length: MAX_HEARTS }).map((_, h) => (
                  <span key={h} className={h < player.hearts ? 'life' : 'life lost'} />
                ))}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
