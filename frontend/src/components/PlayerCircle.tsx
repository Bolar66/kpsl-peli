import { motion } from 'framer-motion';

interface CirclePlayer {
  userId: number;
  username: string;
  hearts: number;
  wins: number;
  isBot: boolean;
  isConnected: boolean;
  hasPicked: boolean;
  isDnf: boolean;
}

interface PlayerCircleProps {
  players: CirclePlayer[];
  countdown: number | null;
  paused: boolean;
}

// Kulma-asemat pelaajamäärän mukaan (astetta, 0 = ylhäällä, myötäpäivään)
const POSITIONS: Record<number, number[]> = {
  1: [0],
  2: [0, 180],
  3: [0, 120, 240],
  4: [0, 90, 180, 270],
};

function getCoordsForAngle(angle: number, radius: number) {
  const rad = (angle - 90) * (Math.PI / 180); // -90 jotta 0° on ylhäällä
  return {
    x: Math.cos(rad) * radius,
    y: Math.sin(rad) * radius,
  };
}

function getCountdownColor(countdown: number | null): string {
  if (countdown === null) return '#00D9C0';
  if (countdown <= 2) return '#FF5470';
  if (countdown <= 4) return '#FFC857';
  return '#00D9C0';
}

export default function PlayerCircle({ players, countdown, paused }: PlayerCircleProps) {
  const positions = POSITIONS[players.length] || POSITIONS[4]!;
  const radius = 100; // pienempi, jotta pienimmätkin puhelinnäytöt mahtuvat ilman vieritystä

  return (
    <div className="player-circle">
      <div className="player-circle-center">
        {countdown !== null && !paused && (
          <motion.div
            key={countdown}
            className="countdown-number"
            style={{ color: getCountdownColor(countdown) }}
            initial={{ scale: 1.3, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.2 }}
          >
            {countdown}
          </motion.div>
        )}
        {paused && <div className="countdown-paused">⏸</div>}
      </div>

      {players.map((player, i) => {
        const angle = positions[i] ?? 0;
        const { x, y } = getCoordsForAngle(angle, radius);

        return (
          <motion.div
            key={player.userId}
            className={`player-avatar ${player.hasPicked ? 'picked' : ''} ${player.isDnf ? 'dnf' : ''}`}
            style={{
              transform: `translate(${x}px, ${y}px)`,
            }}
          >
            <div className="player-avatar-circle">
              {player.username.charAt(0).toUpperCase()}
              {player.hasPicked && <span className="picked-dot" />}
            </div>
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
          </motion.div>
        );
      })}
    </div>
  );
}