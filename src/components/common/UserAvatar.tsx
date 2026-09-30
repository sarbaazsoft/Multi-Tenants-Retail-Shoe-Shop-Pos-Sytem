import React, { useState } from 'react';
import { User as UserIcon } from 'lucide-react';

interface UserAvatarProps {
  name?: string;
  avatarUrl?: string | null;
  role?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  showRoleBadge?: boolean;
}

function getInitials(name?: string): string {
  if (!name || !name.trim()) return 'U';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export const UserAvatar: React.FC<UserAvatarProps> = ({
  name = 'User',
  avatarUrl,
  role = 'CASHIER',
  size = 'md',
  className = '',
  showRoleBadge = false,
}) => {
  const [imageFailed, setImageFailed] = useState(false);
  const initials = getInitials(name);
  const isAdmin = role?.toUpperCase() === 'ADMIN';

  // Size definitions
  const sizeMap = {
    xs: {
      container: 'w-6 h-6 text-[10px]',
      icon: 'w-3 h-3',
      badge: 'w-2 h-2 -bottom-0.5 -right-0.5',
    },
    sm: {
      container: 'w-7 h-7 text-xs',
      icon: 'w-3.5 h-3.5',
      badge: 'w-2.5 h-2.5 -bottom-0.5 -right-0.5',
    },
    md: {
      container: 'w-9 h-9 text-xs',
      icon: 'w-4 h-4',
      badge: 'w-3 h-3 -bottom-0.5 -right-0.5',
    },
    lg: {
      container: 'w-12 h-12 text-sm',
      icon: 'w-5 h-5',
      badge: 'w-3.5 h-3.5 bottom-0 right-0',
    },
    xl: {
      container: 'w-20 h-20 text-xl font-extrabold',
      icon: 'w-8 h-8',
      badge: 'w-5 h-5 bottom-0 right-0',
    },
  };

  const currentSize = sizeMap[size] || sizeMap.md;
  const defaultAvatar = 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80';
  const effectiveAvatar = avatarUrl && avatarUrl.trim() ? avatarUrl : defaultAvatar;
  const hasValidImage = Boolean(effectiveAvatar && !imageFailed);

  return (
    <div className={`relative inline-flex shrink-0 items-center justify-center select-none rounded-full ${className}`}>
      {hasValidImage ? (
        <img
          src={effectiveAvatar}
          alt={name}
          referrerPolicy="no-referrer"
          onError={() => setImageFailed(true)}
          className={`${currentSize.container} rounded-full object-cover shadow-xs`}
        />
      ) : (
        <div
          title={name}
          className={`${currentSize.container} rounded-full flex items-center justify-center font-bold tracking-wider text-white shadow-xs ${
            isAdmin
              ? 'bg-gradient-to-br from-amber-500 via-amber-600 to-amber-700 shadow-amber-900/20'
              : 'bg-gradient-to-br from-blue-600 via-indigo-600 to-slate-800 shadow-blue-900/20'
          }`}
        >
          {initials ? (
            <span>{initials}</span>
          ) : (
            <UserIcon className={currentSize.icon} />
          )}
        </div>
      )}

      {showRoleBadge && (
        <span
          title={isAdmin ? 'Store Owner (Admin)' : 'Staff / Cashier'}
          className={`absolute rounded-full border-2 border-white ring-1 ring-black/10 ${currentSize.badge} ${
            isAdmin ? 'bg-amber-500' : 'bg-blue-600'
          }`}
        />
      )}
    </div>
  );
};
