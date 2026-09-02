import PlayerHand from './PlayerHand';
import CountdownRing from './CountdownRing';

interface CirclePlayer {
  userId: number;
  username: string;
  hearts: number;
  wins: number;
  isBot: boolean;
  isConnected: boolean;
  hasPicked: boolean;
  isDnf: boolean;
  revealedSymbol: string | null;
}

interface PlayerCircleProps {
  players: CirclePlayer[];
  countdown: number | null;
  duration: number;
  paused: boolean;
  isRevealPhase: boolean;
}

const POSITIONS: Record<number, number[]> = {
  1: [0],
  2: [0, 180],
  3: [0, 120, 240],
  4: [0, 90, 180, 270],
};

function getCoordsForAngle(angle: number, radius: number) {
  const rad = (angle - 90) * (Math.PI / 180);
  return {
    x: Math.cos(rad) * radius,
    y: Math.sin(rad) * radius,
  };
}

export default function PlayerCircle({ players, countdown, duration, paused, isRevealPhase }: PlayerCircleProps) {
  const positions = POSITIONS[players.length] || POSITIONS[4]!;
  const radius = 128;

  return (
    <div className="player-circle">
      <div className="player-circle-center">
        {countdown !== null && !paused && (
          <CountdownRing countdown={countdown} duration={duration} />
        )}
        {paused && <div className="countdown-paused">⏸</div>}
      </div>

      {players.map((player, i) => {
        const angle = positions[i] ?? 0;
        const { x, y } = getCoordsForAngle(angle, radius);
        const isAboveCenter = y < -5;

        return (
          <div
            key={player.userId}
            className={`player-avatar ${player.hasPicked ? 'picked' : ''} ${player.isDnf ? 'dnf' : ''} ${isAboveCenter ? 'reversed' : ''}`}
            style={{ transform: `translate(${x}px, ${y}px) translate(-50%, -50%)` }}
          >
            <PlayerHand
              hasPicked={player.hasPicked}
              revealedSymbol={player.revealedSymbol}
              isRevealPhase={isRevealPhase}
              isDnf={player.isDnf}
            />
            <div className="player-avatar-circle">
              {player.username.charAt(0).toUpperCase()}
            </div>
            <div className="player-info-block">
              <div className="player-name">
                {player.username}
                {player.isBot && ' 🤖'}
                {!player.isConnected && !player.isBot && ' ⏳'}
              </div>
              <div className="player-hearts">
                {'❤️'.repeat(player.hearts)}
                {'🖤'.repeat(3 - player.hearts)}
              </div>
              <div className="player-wins">{player.wins} voittoa</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}