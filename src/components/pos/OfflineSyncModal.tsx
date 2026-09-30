import React, { useState } from 'react';
import {
  Wifi,
  WifiOff,
  RefreshCw,
  Clock,
  CheckCircle2,
  AlertCircle,
  Trash2,
  Receipt,
  X,
  Database,
} from 'lucide-react';
import { useOfflineSync } from '../../utils/useOfflineSync.ts';
import { QueuedSale } from '../../utils/offlineDb.ts';
import { formatStockPrice } from '../../utils/priceFormat.ts';

interface OfflineSyncModalProps {
  isOpen: boolean;
  onClose: () => void;
  currencySymbol?: string;
}

export const OfflineSyncModal: React.FC<OfflineSyncModalProps> = ({
  isOpen,
  onClose,
  currencySymbol = 'Rs.',
}) => {
  const { isOnline, pendingCount, isSyncing, queueList, syncNow, retrySale, removeSale } = useOfflineSync();
  const [syncFeedback, setSyncFeedback] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleManualSync = async () => {
    setSyncFeedback(null);
    const result = await syncNow();
    if (result.synced > 0) {
      setSyncFeedback(`Successfully synchronized ${result.synced} transaction(s) to PostgreSQL.`);
    } else if (result.failed > 0) {
      setSyncFeedback(`Sync completed with ${result.failed} failure(s). Check item stock or connection.`);
    } else {
      setSyncFeedback('All offline transactions are already up to date.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4 animate-in fade-in duration-150 no-print">
      <div className="relative w-full max-w-2xl app-modal-container flex flex-col max-h-[85vh] text-slate-900 dark:text-white overflow-hidden">
        {/* Header */}
        <div className="p-4 border-b border-slate-200 dark:border-purple-800/80 flex items-center justify-between bg-slate-50 dark:bg-gradient-to-r dark:from-purple-900 dark:via-indigo-950 dark:to-slate-900 text-slate-900 dark:text-white">
          <div className="flex items-center space-x-3">
            <div
              className={`w-10 h-10 rounded-xl flex items-center justify-center border ${
                isOnline
                  ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                  : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20'
              }`}
            >
              {isOnline ? <Wifi className="w-5 h-5" /> : <WifiOff className="w-5 h-5" />}
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="font-bold text-base text-slate-900 dark:text-white">Offline Sales Queue & Local Persistence</h3>
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                    isOnline
                      ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20'
                      : 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/20'
                  }`}
                >
                  {isOnline ? 'Network Connected' : 'Offline Mode'}
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Transactions saved to browser's IndexedDB when offline, synced automatically to PostgreSQL.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Sync Controls & Summary Banner */}
        <div className="p-4 bg-slate-50 dark:bg-slate-900/60 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center space-x-3 text-xs">
            <div className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-2xs">
              <Database className="w-3.5 h-3.5 text-blue-600 dark:text-cyan-400" />
              <span className="text-slate-600 dark:text-slate-300">Total in Queue:</span>
              <strong className="text-slate-900 dark:text-white font-mono">{queueList.length}</strong>
            </div>
            <div className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-2xs">
              <Clock className="w-3.5 h-3.5 text-amber-500 dark:text-amber-400" />
              <span className="text-slate-600 dark:text-slate-300">Unsynced:</span>
              <strong className="text-amber-600 dark:text-amber-400 font-mono">{pendingCount}</strong>
            </div>
          </div>

          <button
            onClick={handleManualSync}
            disabled={isSyncing || !isOnline || pendingCount === 0}
            className="flex items-center space-x-1.5 px-4 py-2 rounded-xl btn-primary disabled:opacity-50 disabled:cursor-not-allowed font-semibold text-xs text-white shadow-sm transition active:scale-95 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
            <span>{isSyncing ? 'Syncing with Server...' : 'Sync Pending Sales Now'}</span>
          </button>
        </div>

        {syncFeedback && (
          <div className="px-4 py-2 bg-blue-50 dark:bg-indigo-950/60 border-b border-blue-200 dark:border-indigo-800/40 text-xs text-blue-800 dark:text-indigo-200 flex items-center space-x-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span>{syncFeedback}</span>
          </div>
        )}

        {/* Queue Items List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {queueList.length === 0 ? (
            <div className="py-12 text-center text-slate-500 space-y-2">
              <Receipt className="w-12 h-12 mx-auto text-slate-400 dark:text-slate-600 stroke-[1.5]" />
              <p className="text-sm font-medium text-slate-700 dark:text-slate-400">Offline queue is empty</p>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                Any sales completed while internet connection is severed will be securely cached here and automatically posted to PostgreSQL when you reconnect.
              </p>
            </div>
          ) : (
            queueList.map((sale: QueuedSale) => {
              const isPending = sale.status === 'PENDING';
              const isFailed = sale.status === 'FAILED';
              const isSynced = sale.status === 'SYNCED';
              const isSyncingItem = sale.status === 'SYNCING';

              return (
                <div
                  key={sale.clientTxId}
                  className={`p-3.5 rounded-xl border transition-all ${
                    isSynced
                      ? 'bg-slate-50 dark:bg-slate-900/40 border-slate-200 dark:border-slate-800/80'
                      : isFailed
                      ? 'bg-rose-50 dark:bg-rose-950/20 border-rose-200 dark:border-rose-800/40'
                      : 'bg-amber-50/40 dark:bg-slate-800/60 border-amber-200 dark:border-slate-700/60'
                  }`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center space-x-2">
                        <span className="font-mono text-xs font-bold text-slate-900 dark:text-white">
                          {sale.clientTxId}
                        </span>
                        {isSynced && (
                          <span className="flex items-center space-x-1 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-700 dark:text-emerald-300 text-[10px] font-bold">
                            <CheckCircle2 className="w-3 h-3" />
                            <span>PostgreSQL: {sale.syncedInvoiceNumber}</span>
                          </span>
                        )}
                        {isPending && (
                          <span className="flex items-center space-x-1 px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-300 text-[10px] font-bold">
                            <Clock className="w-3 h-3" />
                            <span>Queued (Pending Sync)</span>
                          </span>
                        )}
                        {isSyncingItem && (
                          <span className="flex items-center space-x-1 px-2 py-0.5 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-700 dark:text-indigo-300 text-[10px] font-bold">
                            <RefreshCw className="w-3 h-3 animate-spin" />
                            <span>Syncing...</span>
                          </span>
                        )}
                        {isFailed && (
                          <span className="flex items-center space-x-1 px-2 py-0.5 rounded-full bg-rose-500/10 border border-rose-500/20 text-rose-700 dark:text-rose-300 text-[10px] font-bold">
                            <AlertCircle className="w-3 h-3" />
                            <span>Sync Error</span>
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 flex items-center space-x-3">
                        <span>{new Date(sale.createdAt).toLocaleString()}</span>
                        <span>•</span>
                        <span>{sale.items.length} item(s)</span>
                        <span>•</span>
                        <span className="uppercase">{sale.paymentMethod}</span>
                        {sale.customerName && (
                          <>
                            <span>•</span>
                            <span className="text-slate-700 dark:text-slate-300">{sale.customerName}</span>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="text-right flex items-center space-x-3">
                      <div>
                        <div className="text-sm font-bold font-mono text-emerald-600 dark:text-emerald-400">
                          {currencySymbol} {formatStockPrice(sale.totalAmount)}
                        </div>
                        <div className="text-[10px] text-slate-500">
                          Paid: {currencySymbol} {formatStockPrice(sale.cashReceived)}
                        </div>
                      </div>

                      <div className="flex items-center space-x-1">
                        {isFailed && (
                          <button
                            onClick={() => retrySale(sale)}
                            title="Retry sync"
                            className="p-1.5 rounded-lg text-blue-600 dark:text-indigo-400 hover:bg-blue-50 dark:hover:bg-indigo-600/30 transition cursor-pointer"
                          >
                            <RefreshCw className="w-4 h-4" />
                          </button>
                        )}
                        <button
                          onClick={() => removeSale(sale.clientTxId)}
                          title="Remove from local queue"
                          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Items list preview */}
                  <div className="mt-2.5 pt-2 border-t border-slate-200 dark:border-slate-800/80 flex flex-wrap gap-1.5 text-[10px]">
                    {sale.items.map((item, idx) => (
                      <span
                        key={idx}
                        className="px-2 py-0.5 rounded bg-white dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 font-mono shadow-2xs"
                      >
                        {item.quantity}x {item.article || item.name} ({currencySymbol} {formatStockPrice(item.unitPrice)})
                      </span>
                    ))}
                  </div>

                  {sale.errorMessage && (
                    <div className="mt-2 text-[11px] text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/40 p-2 rounded-lg border border-rose-200 dark:border-rose-900/50">
                      Reason: {sale.errorMessage}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-200 dark:border-purple-800/80 bg-slate-50 dark:bg-gradient-to-r dark:from-purple-900/90 dark:via-indigo-950/85 dark:to-slate-900 flex items-center justify-between text-xs text-slate-500 dark:text-slate-300">
          <div className="flex items-center space-x-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
            <span>Local IndexedDB ready for high-speed offline counter trading</span>
          </div>
          <button
            onClick={onClose}
            className="btn-secondary px-4 py-2 text-xs font-semibold cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
