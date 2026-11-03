import { initial, playerColor } from '../constants/players';

export interface AvatarData {
  userId: number;
  username: string;
  isBot?: boolean;
  avatarEmoji?: string | null;
  avatarColor?: string | null;
  avatarImage?: string | null;
}

interface AvatarProps {
  player: AvatarData;
  size?: number;
  className?: string;
}

// Profiilikuva: oma kuva, emoji tai alkukirjain pelaajan värillä
export default function Avatar({ player, size = 36, className = '' }: AvatarProps) {
  const background = player.avatarColor || playerColor(player.userId);
  const content = player.avatarImage
    ? null
    : player.avatarEmoji || (player.isBot && player.userId < 0 ? '🤖' : initial(player.username));
  const isEmoji = !player.avatarImage && (!!player.avatarEmoji || (player.isBot && player.userId < 0));

  return (
    <span
      className={`avatar-img ${className}`}
      style={{
        width: size,
        height: size,
        fontSize: isEmoji ? size * 0.55 : size * 0.42,
        background: player.avatarImage ? `center / cover no-repeat url(${player.avatarImage})` : background,
      }}
      aria-hidden="true"
    >
      {content}
    </span>
  );
}
