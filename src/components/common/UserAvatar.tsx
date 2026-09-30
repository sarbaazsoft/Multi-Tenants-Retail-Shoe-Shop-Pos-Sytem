import React, { useState, useEffect } from 'react';
import { User as UserIcon } from 'lucide-react';

interface UserAvatarProps {
  name?: string;
  avatarUrl?: string | null;
  role?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  showRoleBadge?: boolean;
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
  const isAdmin = role?.toUpperCase() === 'ADMIN' || role?.toUpperCase() === 'SUPERADMIN';

  useEffect(() => {
    setImageFailed(false);
  }, [avatarUrl]);

  // Size definitions
  const sizeMap = {
    xs: {
      container: 'w-6 h-6 text-[10px]',
      icon: 'w-3.5 h-3.5',
      badge: 'w-2 h-2 -bottom-0.5 -right-0.5',
    },
    sm: {
      container: 'w-7 h-7 text-xs',
      icon: 'w-4 h-4',
      badge: 'w-2.5 h-2.5 -bottom-0.5 -right-0.5',
    },
    md: {
      container: 'w-9 h-9 text-xs',
      icon: 'w-4 h-4',
      badge: 'w-3 h-3 -bottom-0.5 -right-0.5',
    },
    lg: {
      container: 'w-12 h-12 text-sm',
      icon: 'w-6 h-6',
      badge: 'w-3.5 h-3.5 bottom-0 right-0',
    },
    xl: {
      container: 'w-20 h-20 text-xl font-extrabold',
      icon: 'w-10 h-10',
      badge: 'w-5 h-5 bottom-0 right-0',
    },
  };

  const currentSize = sizeMap[size] || sizeMap.md;
  const effectiveAvatar = avatarUrl && avatarUrl.trim() ? avatarUrl.trim() : '';
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
              ? 'bg-gradient-to-br from-purple-600 via-indigo-600 to-purple-700 shadow-purple-900/20'
              : 'bg-gradient-to-br from-blue-600 via-indigo-600 to-slate-800 shadow-blue-900/20'
          }`}
        >
          <UserIcon className={currentSize.icon} />
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
