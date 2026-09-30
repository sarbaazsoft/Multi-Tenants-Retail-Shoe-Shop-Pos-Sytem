import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { WifiOff, Database, RefreshCw, ChevronRight } from 'lucide-react';
import { useOfflineSync } from '../../utils/useOfflineSync.ts';
import { OfflineSyncModal } from '../pos/OfflineSyncModal.tsx';

interface OfflineToastNotificationProps {
  currencySymbol?: string;
}

export const OfflineToastNotification: React.FC<OfflineToastNotificationProps> = ({
  currencySymbol = 'Rs.',
}) => {
  // Directly bind to navigator.onLine state with window online/offline listeners
  const [isOnlineState, setIsOnlineState] = useState<boolean>(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const { pendingCount, isSyncing } = useOfflineSync();

  useEffect(() => {
    const handleOnline = () => setIsOnlineState(true);
    const handleOffline = () => setIsOnlineState(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Strict condition: appears at the bottom of the screen ONLY when navigator.onLine is false
  const isOffline = !isOnlineState;

  return (
    <>
      <AnimatePresence>
        {isOffline && (
          <motion.div
            id="offline-mode-toast-notification"
            role="status"
            aria-live="polite"
            initial={{ opacity: 0, y: 50, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 50, scale: 0.95 }}
            transition={{ type: 'spring', damping: 25, stiffness: 350 }}
            className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-6 sm:max-w-md z-50 no-print pointer-events-auto"
          >
            <div className="bg-slate-900/95 backdrop-blur-md border border-amber-500/50 rounded-2xl shadow-2xl shadow-amber-950/40 p-4 text-white ring-1 ring-amber-500/30">
              <div className="flex items-start justify-between gap-3">
                {/* Icon indicator */}
                <div className="relative shrink-0 mt-0.5">
                  <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400">
                    <WifiOff className="w-5 h-5" />
                  </div>
                  <span className="absolute -top-1 -right-1 flex h-3 w-3">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-amber-500" />
                  </span>
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h4 className="text-sm font-bold text-white tracking-tight flex items-center gap-1.5">
                      Offline Mode Active
                    </h4>
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                      No Internet
                    </span>
                  </div>

                  <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                    POS operations are running on local cache. Sales will queue safely and auto-sync to PostgreSQL when reconnected.
                  </p>

                  {/* Pending transactions badge & action trigger */}
                  <div className="mt-2.5 flex items-center justify-between gap-2 pt-2 border-t border-slate-800">
                    <div className="flex items-center gap-1.5 text-xs text-slate-400">
                      <Database className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                      <span>
                        Queue:{' '}
                        <strong className="text-white font-semibold">
                          {pendingCount} sale{pendingCount === 1 ? '' : 's'}
                        </strong>
                      </span>
                      {isSyncing && (
                        <RefreshCw className="w-3 h-3 text-indigo-400 animate-spin ml-1 shrink-0" />
                      )}
                    </div>

                    <button
                      type="button"
                      id="offline-toast-view-queue-btn"
                      onClick={() => setIsModalOpen(true)}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-amber-400 hover:text-amber-300 bg-amber-500/10 hover:bg-amber-500/20 px-2.5 py-1 rounded-lg border border-amber-500/30 transition-colors cursor-pointer"
                    >
                      <span>View Queue</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Offline Queue & Sync Modal */}
      <OfflineSyncModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        currencySymbol={currencySymbol}
      />
    </>
  );
};
