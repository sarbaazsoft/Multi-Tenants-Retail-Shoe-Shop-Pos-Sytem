import React, { useState, useEffect } from 'react';
import { Tag } from 'lucide-react';

export interface BrandLogoProps {
  logo?: string | null;
  name: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  imgClassName?: string;
  showName?: boolean;
  nameClassName?: string;
  subtext?: string;
  id?: string;
}

const sizeConfig = {
  xs: {
    container: 'w-6 h-6 min-w-6 rounded-md text-[10px]',
    icon: 'w-3 h-3',
    img: 'max-w-[20px] max-h-[20px]',
    text: 'text-xs',
  },
  sm: {
    container: 'w-8 h-8 min-w-8 rounded-lg text-xs',
    icon: 'w-3.5 h-3.5',
    img: 'max-w-[26px] max-h-[26px]',
    text: 'text-xs',
  },
  md: {
    container: 'w-10 h-10 min-w-10 rounded-xl text-sm',
    icon: 'w-4 h-4',
    img: 'max-w-[34px] max-h-[34px]',
    text: 'text-sm',
  },
  lg: {
    container: 'w-14 h-14 min-w-14 rounded-2xl text-base',
    icon: 'w-6 h-6',
    img: 'max-w-[48px] max-h-[48px]',
    text: 'text-base',
  },
  xl: {
    container: 'w-20 h-20 min-w-20 rounded-2xl text-xl',
    icon: 'w-8 h-8',
    img: 'max-w-[68px] max-h-[68px]',
    text: 'text-lg',
  },
};

export const BrandLogo: React.FC<BrandLogoProps> = ({
  logo,
  name,
  size = 'md',
  className = '',
  imgClassName = '',
  showName = false,
  nameClassName = '',
  subtext,
  id,
}) => {
  const [imageFailed, setImageFailed] = useState(false);
  const cfg = sizeConfig[size] || sizeConfig.md;

  // Reset error state if logo prop changes
  useEffect(() => {
    setImageFailed(false);
  }, [logo]);

  const initials = (name || 'BR')
    .trim()
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase() || 'BR';

  const hasValidLogo = Boolean(logo && typeof logo === 'string' && logo.trim().length > 0 && !imageFailed);

  return (
    <div
      id={id}
      className={`inline-flex items-center gap-2.5 select-none ${className}`}
      title={name}
    >
      <div
        className={`relative flex items-center justify-center overflow-hidden border shrink-0 transition-all ${
          cfg.container
        } ${
          hasValidLogo
            ? 'bg-white dark:bg-slate-900 border-slate-200/90 dark:border-slate-800 shadow-2xs'
            : 'bg-gradient-to-br from-blue-50 to-indigo-50/80 dark:from-blue-950/50 dark:to-indigo-950/40 border-blue-200/80 dark:border-blue-900/60 text-blue-600 dark:text-cyan-400 font-bold shadow-2xs'
        }`}
      >
        {hasValidLogo ? (
          <img
            src={logo!.trim()}
            alt={`${name} logo`}
            referrerPolicy="no-referrer"
            onError={() => setImageFailed(true)}
            className={`object-contain transition-transform duration-200 ${cfg.img} ${imgClassName}`}
          />
        ) : (
          <div className="flex flex-col items-center justify-center leading-none text-center">
            {size === 'xs' || size === 'sm' ? (
              <span className="font-extrabold tracking-tight">{initials}</span>
            ) : (
              <div className="flex flex-col items-center justify-center gap-0.5">
                <Tag className={`${cfg.icon} opacity-85 stroke-[2.2]`} />
                <span className="font-extrabold text-[9px] tracking-tight opacity-90">
                  {initials}
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      {showName && (
        <div className="flex flex-col min-w-0">
          <span
            className={`font-bold truncate text-slate-900 dark:text-white ${cfg.text} ${nameClassName}`}
          >
            {name}
          </span>
          {subtext && (
            <span className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
              {subtext}
            </span>
          )}
        </div>
      )}
    </div>
  );
};
