import React from 'react';
import { ShowroomBackground } from './ShowroomBackground.tsx';
import { PublicHeader, PublicHeaderProps } from './PublicHeader.tsx';
import { PublicFooter } from './PublicFooter.tsx';

export interface PublicLayoutProps extends PublicHeaderProps {
  children: React.ReactNode;
  contentClassName?: string;
}

/**
 * PublicLayout
 * Standard wrapper for public and onboarding routes (Loading, Auth, InstallWizard)
 * providing aligned showroom background opacity (80%), global header, and global footer.
 */
export const PublicLayout: React.FC<PublicLayoutProps> = ({
  children,
  storeName,
  badgeText,
  badgeVariant,
  subtitle,
  dbText,
  contentClassName = '',
}) => {
  return (
    <div className="min-h-screen w-full flex flex-col justify-between relative overflow-x-hidden bg-slate-900 dark:bg-[#0A0E1A] text-slate-900 dark:text-slate-100 font-sans selection:bg-purple-600 selection:text-white transition-colors duration-200">
      {/* Aligned Showroom Background (80% opacity + subtle depth overlay) */}
      <ShowroomBackground />

      {/* Global Public Header */}
      <PublicHeader
        storeName={storeName}
        badgeText={badgeText}
        badgeVariant={badgeVariant}
        subtitle={subtitle}
        dbText={dbText}
      />

      {/* Centered Main Viewport */}
      <main className={`relative z-10 flex-1 flex flex-col justify-center items-center px-4 py-6 sm:px-8 sm:py-10 ${contentClassName}`}>
        {children}
      </main>

      {/* Global Public Footer */}
      <PublicFooter storeName={storeName} subtitle={subtitle} />
    </div>
  );
};
