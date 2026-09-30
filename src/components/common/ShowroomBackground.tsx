import React from 'react';

interface ShowroomBackgroundProps {
  className?: string;
}

/**
 * ShowroomBackground
 * Aligned showroom background layer with 80% opacity and subtle depth overlay
 * ensuring crisp text legibility while keeping the footwear showroom vividly visible.
 */
export const ShowroomBackground: React.FC<ShowroomBackgroundProps> = ({ className = '' }) => {
  return (
    <>
      {/* Showroom Background Image Layer (80% visible / opacity-80) */}
      <div
        id="showroom-bg-image-layer"
        className={`fixed inset-0 z-0 bg-cover bg-center bg-no-repeat opacity-80 pointer-events-none transition-opacity duration-300 ${className}`}
        style={{
          backgroundImage: "url('/assets/images/hd-07.jpg')",
        }}
        aria-hidden="true"
      />

      {/* Subtle depth overlay ensuring crisp text contrast while keeping showroom 80% visible */}
      <div
        id="showroom-bg-depth-overlay"
        className="fixed inset-0 z-0 bg-slate-900/10 dark:bg-slate-950/25 pointer-events-none"
        aria-hidden="true"
      />
    </>
  );
};
