// Offline Sales Queue Manager: Background synchronization, queue status listener, and local fallback

import { api, getAuthToken } from './api.ts';
import {
  QueuedSale,
  queueOfflineSale,
  getOfflineSales,
  getPendingOfflineSalesCount,
  updateOfflineSaleStatus,
  deleteOfflineSale,
  cacheCatalogOffline,
} from '../utils/offlineDb.ts';

type QueueListener = (
  pendingCount: number,
  isSyncing: boolean,
  isBackendConnected: boolean,
  lastSyncedAt: Date | null
) => void;

class OfflineQueueService {
  private isOnlineState: boolean = typeof navigator !== 'undefined' ? navigator.onLine : true;
  private isBackendConnectedState: boolean = true;
  private isSyncingState: boolean = false;
  private lastSyncedAtState: Date | null = null;
  private listeners: Set<QueueListener> = new Set();
  private syncIntervalId: any = null;
  private healthCheckIntervalId: any = null;

  constructor() {
    // Restore cached lastSyncedAt if available
    try {
      const cached = localStorage.getItem('pos_last_synced_at');
      if (cached) {
        this.lastSyncedAtState = new Date(cached);
      } else {
        this.lastSyncedAtState = new Date();
      }
    } catch {
      this.lastSyncedAtState = new Date();
    }

    // Listen to browser network changes
    window.addEventListener('online', this.handleOnline);
    window.addEventListener('offline', this.handleOffline);
    window.addEventListener('focus', this.handleWindowFocus);

    // Initial check and start periodic background checks
    this.notify();
    this.checkBackendHealth();
    this.startPeriodicSync();
  }

  public get isOnline(): boolean {
    return this.isOnlineState;
  }

  public get isBackendConnected(): boolean {
    return this.isBackendConnectedState;
  }

  public get isSyncing(): boolean {
    return this.isSyncingState;
  }

  public get lastSyncedAt(): Date | null {
    return this.lastSyncedAtState;
  }

  public subscribe(listener: QueueListener): () => void {
    this.listeners.add(listener);
    // Notify immediately
    this.notify();
    return () => {
      this.listeners.delete(listener);
    };
  }

  private async notify() {
    try {
      const count = await getPendingOfflineSalesCount();
      for (const fn of this.listeners) {
        fn(count, this.isSyncingState, this.isBackendConnectedState, this.lastSyncedAtState);
      }
    } catch (e) {
      console.warn('[OfflineSync] Failed to query count:', e);
    }
  }

  /**
   * Ping backend directly to verify remote server responsiveness
   */
  public async checkBackendHealth(): Promise<boolean> {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      this.isOnlineState = false;
      this.isBackendConnectedState = false;
      this.notify();
      return false;
    }

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 4500);
      const res = await fetch('/api/health', {
        method: 'GET',
        signal: controller.signal,
        headers: { 'Cache-Control': 'no-cache' },
      });
      clearTimeout(timer);

      const wasDisconnected = !this.isBackendConnectedState;
      const isOk = res.ok;
      this.isBackendConnectedState = isOk;
      this.isOnlineState = isOk;

      if (isOk) {
        // If we just reconnected, or if we have unsynced transactions, trigger sync
        if (wasDisconnected) {
          console.log('[OfflineSync] Backend reconnected. Initiating automatic sync...');
          this.syncPendingSales();
        }
      }
    } catch {
      this.isBackendConnectedState = false;
    }

    this.notify();
    return this.isBackendConnectedState;
  }

  /**
   * Record that a transaction or action was successfully saved on remote backend
   */
  public recordRemoteSave() {
    this.lastSyncedAtState = new Date();
    this.isBackendConnectedState = true;
    this.isOnlineState = true;
    try {
      localStorage.setItem('pos_last_synced_at', this.lastSyncedAtState.toISOString());
    } catch {}
    this.notify();
  }

  private handleOnline = async () => {
    console.log('[OfflineSync] Network back ONLINE. Checking backend and auto-syncing...');
    this.isOnlineState = true;
    await this.checkBackendHealth();
    await this.syncPendingSales();
  };

  private handleOffline = () => {
    console.log('[OfflineSync] Network is OFFLINE. POS will queue checkouts locally in IndexedDB.');
    this.isOnlineState = false;
    this.isBackendConnectedState = false;
    this.notify();
  };

  private handleWindowFocus = () => {
    // When user returns to tab, perform a lightweight backend health check
    this.checkBackendHealth();
  };

  private startPeriodicSync() {
    if (this.syncIntervalId) clearInterval(this.syncIntervalId);
    if (this.healthCheckIntervalId) clearInterval(this.healthCheckIntervalId);

    // Every 12 seconds: perform lightweight ping to check backend connectivity
    this.healthCheckIntervalId = setInterval(() => {
      this.checkBackendHealth();
    }, 12000);

    // Every 20 seconds, if backend is connected, flush any unsynced offline sales
    this.syncIntervalId = setInterval(() => {
      if (this.isBackendConnectedState && !this.isSyncingState) {
        this.syncPendingSales();
      }
    }, 20000);
  }

  /**
   * Save an offline sale to IndexedDB
   */
  public async enqueueSale(sale: Omit<QueuedSale, 'clientTxId' | 'createdAt' | 'status'>): Promise<QueuedSale> {
    const clientTxId = `OFFLINE-${Date.now()}-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;
    const queued: QueuedSale = {
      ...sale,
      clientTxId,
      createdAt: new Date().toISOString(),
      status: 'PENDING',
    };

    await queueOfflineSale(queued);
    await this.notify();

    // If online right now, attempt immediate background flush
    if (this.isOnlineState) {
      setTimeout(() => this.syncPendingSales(), 100);
    }

    return queued;
  }

  /**
   * Synchronize all pending sales in chronological order to PostgreSQL
   */
  public async syncPendingSales(): Promise<{ synced: number; failed: number }> {
    if (this.isSyncingState) {
      return { synced: 0, failed: 0 };
    }

    // Do not attempt network checkout if browser is explicitly offline
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      this.isOnlineState = false;
      this.isBackendConnectedState = false;
      this.notify();
      return { synced: 0, failed: 0 };
    }

    // Do not attempt checkout if user is not authenticated yet (e.g. login screen)
    const token = getAuthToken();
    if (!token) {
      return { synced: 0, failed: 0 };
    }

    const allSales = await getOfflineSales();
    const pendingSales = allSales.filter((s) => s.status === 'PENDING' || s.status === 'FAILED');

    if (pendingSales.length === 0) {
      this.notify();
      return { synced: 0, failed: 0 };
    }

    this.isSyncingState = true;
    this.notify();

    let synced = 0;
    let failed = 0;

    // Process in FIFO order (oldest offline transaction first to preserve sequential inventory deductions)
    const sorted = [...pendingSales].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );

    for (const sale of sorted) {
      try {
        await updateOfflineSaleStatus(sale.clientTxId, 'SYNCING');
        this.notify();

        const payload: any = {
          clientTxId: sale.clientTxId,
          saleDate: sale.createdAt,
          items: sale.items.map((i) => ({
            productId: i.productId,
            quantity: i.quantity,
            unitPrice: i.unitPrice,
            discount: i.discount,
          })),
          customerId: sale.customerId,
          paymentMethod: sale.paymentMethod,
          cashReceived: sale.cashReceived,
          changeGiven: sale.changeGiven,
          notes: sale.notes,
        };

        const res = await api.pos.checkout(payload);

        // Mark as synced with generated official invoice number
        await updateOfflineSaleStatus(sale.clientTxId, 'SYNCED', {
          syncedInvoiceNumber: res.invoiceNumber,
          syncedAt: new Date().toISOString(),
          errorMessage: undefined,
        });

        synced++;
      } catch (err: any) {
        const rawMsg = String(err?.message || err || '');
        const isNetworkError =
          rawMsg.includes('Failed to fetch') ||
          rawMsg.includes('NetworkError') ||
          rawMsg.includes('Network request failed') ||
          rawMsg.includes('Load failed') ||
          rawMsg.includes('ERR_CONNECTION') ||
          rawMsg.includes('abort');

        if (isNetworkError) {
          console.warn(`[OfflineSync] Remote server temporarily unreachable while syncing ${sale.clientTxId}. Waiting for connection...`);
          this.isBackendConnectedState = false;
          this.isOnlineState = false;
          await updateOfflineSaleStatus(sale.clientTxId, 'PENDING', {
            errorMessage: 'Server offline (will auto-retry on reconnect)',
          });
          failed++;
          break; // Stop immediately, avoid flooding when network is unreachable
        } else {
          console.warn(`[OfflineSync] Sale ${sale.clientTxId} sync error: ${rawMsg}`);
          await updateOfflineSaleStatus(sale.clientTxId, 'FAILED', {
            errorMessage: rawMsg,
          });
          failed++;
        }
      }
    }

    this.isSyncingState = false;
    if (synced > 0) {
      this.lastSyncedAtState = new Date();
      this.isBackendConnectedState = true;
      try {
        localStorage.setItem('pos_last_synced_at', this.lastSyncedAtState.toISOString());
      } catch {}
    }
    this.notify();
    return { synced, failed };
  }

  /**
   * Helper to refresh offline catalog cache
   */
  public async primeCatalogCache(): Promise<void> {
    try {
      const res = await api.products.list({ limit: 500 } as any);
      if (res && res.products) {
        await cacheCatalogOffline(res.products);
        console.log(`[OfflineSync] Cached ${res.products.length} products for offline POS use.`);
      }
    } catch (err) {
      console.warn('[OfflineSync] Could not prime catalog cache:', err);
    }
  }

  public async getQueue(): Promise<QueuedSale[]> {
    return getOfflineSales();
  }

  public async removeSale(clientTxId: string): Promise<void> {
    await deleteOfflineSale(clientTxId);
    this.notify();
  }

  public async retrySingleSale(sale: QueuedSale): Promise<boolean> {
    const token = getAuthToken();
    if (!token) {
      console.warn('[OfflineSync] Cannot retry sync: user is not logged in.');
      return false;
    }

    try {
      await updateOfflineSaleStatus(sale.clientTxId, 'SYNCING');
      this.notify();

      const payload: any = {
        clientTxId: sale.clientTxId,
        saleDate: sale.createdAt,
        items: sale.items.map((i) => ({
          productId: i.productId,
          quantity: i.quantity,
          unitPrice: i.unitPrice,
          discount: i.discount,
        })),
        customerId: sale.customerId,
        paymentMethod: sale.paymentMethod,
        cashReceived: sale.cashReceived,
        changeGiven: sale.changeGiven,
        notes: sale.notes,
      };

      const res = await api.pos.checkout(payload);

      await updateOfflineSaleStatus(sale.clientTxId, 'SYNCED', {
        syncedInvoiceNumber: res.invoiceNumber,
        syncedAt: new Date().toISOString(),
        errorMessage: undefined,
      });
      this.recordRemoteSave();
      return true;
    } catch (err: any) {
      const rawMsg = String(err?.message || err || '');
      console.warn(`[OfflineSync] Retry for sale ${sale.clientTxId} notice:`, rawMsg);
      await updateOfflineSaleStatus(sale.clientTxId, 'FAILED', {
        errorMessage: rawMsg,
      });
      this.notify();
      return false;
    }
  }
}

export const offlineQueueService = new OfflineQueueService();
