import type { ReactNode } from 'react';
import Avatar from './Avatar';

interface ProfileHeaderProps {
  user: {
    id: number;
    username: string;
    avatarEmoji: string | null;
    avatarColor: string | null;
    avatarImage: string | null;
    bannerImage?: string | null;
    bio?: string | null;
  };
  badge?: ReactNode;
  children?: ReactNode;
}

// Profiilin yläosa: taustakuva (tai korostusvärinen oletustausta), profiilikuva, nimi ja bio
export default function ProfileHeader({ user, badge, children }: ProfileHeaderProps) {
  return (
    <section className="profile-header">
      <div
        className={`profile-banner ${user.bannerImage ? '' : 'empty'}`}
        style={user.bannerImage ? { backgroundImage: `url(${user.bannerImage})` } : undefined}
        aria-hidden="true"
      />
      <div className="profile-header-body">
        <div className="profile-header-avatar">
          <Avatar player={{ userId: user.id, username: user.username, avatarEmoji: user.avatarEmoji, avatarColor: user.avatarColor, avatarImage: user.avatarImage }} size={88} />
        </div>
        <h1>{user.username}</h1>
        {badge}
        {user.bio && <p className="profile-bio">{user.bio}</p>}
        {children}
      </div>
    </section>
  );
}
