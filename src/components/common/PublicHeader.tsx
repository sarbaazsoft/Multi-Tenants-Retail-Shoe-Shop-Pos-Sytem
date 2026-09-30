import React from 'react';
import { Store, Database, Sparkles, ShieldAlert, Loader2 } from 'lucide-react';
import { ThemeDropdown } from './ThemeDropdown.tsx';

export interface PublicHeaderProps {
  storeName?: string;
  badgeText?: string;
  badgeVariant?: 'online' | 'wizard' | 'connecting' | 'locked';
  subtitle?: string;
  dbText?: string;
}

/**
 * PublicHeader
 * Global header for onboarding, authentication, and loading routes.
 * Offers consistent backdrop blur, store branding, live status, and 3-way dark/light/system theme switching.
 */
export const PublicHeader: React.FC<PublicHeaderProps> = ({
  storeName = 'Shoe Shop POS',
  badgeText = 'Terminal Online',
  badgeVariant = 'online',
  subtitle = 'Footwear Retail POS & Inventory Suite',
  dbText = 'PostgreSQL 16 • Online',
}) => {

  const renderBadge = () => {
    switch (badgeVariant) {
      case 'wizard':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-indigo-500/20 dark:bg-indigo-500/30 border border-indigo-400/40 text-indigo-700 dark:text-indigo-200 shadow-2xs">
            <Sparkles className="w-3 h-3 text-indigo-500 dark:text-indigo-300" />
            {badgeText}
          </span>
        );
      case 'connecting':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/15 dark:bg-amber-500/20 border border-amber-400/30 text-amber-700 dark:text-amber-300 shadow-2xs">
            <Loader2 className="w-3 h-3 animate-spin text-amber-500 dark:text-amber-400" />
            {badgeText}
          </span>
        );
      case 'locked':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/15 dark:bg-rose-500/20 border border-rose-400/30 text-rose-700 dark:text-rose-300 shadow-2xs">
            <ShieldAlert className="w-3 h-3 text-rose-500 dark:text-rose-400" />
            {badgeText}
          </span>
        );
      case 'online':
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50/80 dark:bg-emerald-500/20 border border-emerald-200/80 dark:border-emerald-400/30 text-emerald-700 dark:text-emerald-300 shadow-2xs">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 dark:bg-emerald-400 animate-pulse" />
            {badgeText}
          </span>
        );
    }
  };

  return (
    <header
      id="global-public-header"
      className="sticky top-0 z-30 w-full h-16 flex items-center px-4 rounded-b-lg border border-indigo-500/20 bg-white/95 dark:bg-white/10 backdrop-blur-lg shadow-lg transition-colors duration-500 justify-between gap-4 sm:gap-6 md:gap-8 select-none text-slate-800 dark:text-slate-100"
    >
      {/* Brand identity & titles */}
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-purple-600 to-indigo-600 text-white flex items-center justify-center font-bold shadow-md shadow-purple-600/25 dark:shadow-[0_0_14px_rgba(147,51,234,0.35)] border border-purple-400/40 dark:border-purple-400/50 shrink-0">
          <Store className="w-5 h-5" />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-bold text-slate-900 dark:text-white text-base tracking-tight leading-tight truncate block">
              {storeName}
            </span>
            <div className="hidden sm:inline-block shrink-0">
              {renderBadge()}
            </div>
          </div>
          <span className="text-xs text-slate-500 dark:text-slate-400 font-medium flex items-center gap-1 truncate">
            <span>👟</span>
            <span>{subtitle}</span>
          </span>
        </div>
      </div>

      {/* Right side status badges & Theme toggle */}
      <div className="flex items-center gap-2.5 sm:gap-3.5 shrink-0 ml-auto pl-2">
        {dbText && (
          <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-purple-500/20 border border-slate-200 dark:border-purple-400/40 text-xs text-slate-700 dark:text-purple-200 dark:shadow-[0_0_14px_rgba(147,51,234,0.2)] font-medium">
            <Database className="w-3.5 h-3.5 text-purple-600 dark:text-purple-200" />
            <span>{dbText}</span>
          </div>
        )}

        {/* 3-Way Theme Preference Dropdown Menu */}
        <ThemeDropdown id="global-public-theme-dropdown" />
      </div>
    </header>
  );
};
