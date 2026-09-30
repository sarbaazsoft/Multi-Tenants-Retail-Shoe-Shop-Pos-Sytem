// IndexedDB Persistent Queue for Offline POS Sales Transactions

export interface QueuedSaleItem {
  productId: number;
  article?: string;
  name?: string;
  sku?: string;
  barcode?: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  subtotal?: number;
  totalStock?: number;
}

export interface QueuedSale {
  clientTxId: string; // Unique local identifier e.g. "OFFLINE-1726578000-abcd"
  createdAt: string; // ISO date string when cashier pressed Complete Sale
  items: QueuedSaleItem[];
  customerId: number | null;
  customerName?: string;
  customerPhone?: string;
  paymentMethod: 'CASH' | 'CARD' | 'SPLIT' | 'BANK_TRANSFER' | 'ONLINE';
  cashReceived: number;
  changeGiven: number;
  subtotal?: number;
  totalDiscount?: number;
  totalAmount: number;
  notes: string;
  cashierName?: string;
  cashierId?: number;
  status: 'PENDING' | 'SYNCING' | 'SYNCED' | 'FAILED';
  errorMessage?: string;
  syncedInvoiceNumber?: string;
  syncedAt?: string;
}

const DB_NAME = 'ShoePosOfflineDB';
const DB_VERSION = 1;
const STORE_SALES = 'offline_sales_queue';
const STORE_CATALOG = 'cached_products';

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_SALES)) {
        const salesStore = db.createObjectStore(STORE_SALES, { keyPath: 'clientTxId' });
        salesStore.createIndex('status', 'status', { unique: false });
        salesStore.createIndex('createdAt', 'createdAt', { unique: false });
      }
      if (!db.objectStoreNames.contains(STORE_CATALOG)) {
        const catalogStore = db.createObjectStore(STORE_CATALOG, { keyPath: 'id' });
        catalogStore.createIndex('barcode', 'barcode', { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Save an offline sale to IndexedDB
 */
export async function queueOfflineSale(sale: QueuedSale): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_SALES, 'readwrite');
    const store = tx.objectStore(STORE_SALES);
    const req = store.put(sale);

    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

/**
 * Get all queued offline sales
 */
export async function getOfflineSales(): Promise<QueuedSale[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_SALES, 'readonly');
    const store = tx.objectStore(STORE_SALES);
    const req = store.getAll();

    req.onsuccess = () => {
      // Sort pending first, then newest to oldest
      const results = (req.result as QueuedSale[]) || [];
      results.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      resolve(results);
    };
    req.onerror = () => reject(req.error);
  });
}

/**
 * Get count of pending offline sales
 */
export async function getPendingOfflineSalesCount(): Promise<number> {
  const all = await getOfflineSales();
  return all.filter((s) => s.status === 'PENDING' || s.status === 'FAILED').length;
}

/**
 * Update an offline sale status
 */
export async function updateOfflineSaleStatus(
  clientTxId: string,
  status: QueuedSale['status'],
  extra?: { syncedInvoiceNumber?: string; errorMessage?: string; syncedAt?: string }
): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_SALES, 'readwrite');
    const store = tx.objectStore(STORE_SALES);
    const getReq = store.get(clientTxId);

    getReq.onsuccess = () => {
      const item: QueuedSale = getReq.result;
      if (!item) {
        resolve();
        return;
      }
      item.status = status;
      if (extra?.syncedInvoiceNumber) item.syncedInvoiceNumber = extra.syncedInvoiceNumber;
      if (extra?.errorMessage !== undefined) item.errorMessage = extra.errorMessage;
      if (extra?.syncedAt) item.syncedAt = extra.syncedAt;

      const putReq = store.put(item);
      putReq.onsuccess = () => resolve();
      putReq.onerror = () => reject(putReq.error);
    };
    getReq.onerror = () => reject(getReq.error);
  });
}

/**
 * Delete a synced or rejected offline sale from IndexedDB
 */
export async function deleteOfflineSale(clientTxId: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_SALES, 'readwrite');
    const store = tx.objectStore(STORE_SALES);
    const req = store.delete(clientTxId);

    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

/**
 * Cache products list into IndexedDB for offline product search and barcode lookup
 */
export async function cacheCatalogOffline(products: any[]): Promise<void> {
  if (!Array.isArray(products) || products.length === 0) return;
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_CATALOG, 'readwrite');
    const store = tx.objectStore(STORE_CATALOG);
    for (const p of products) {
      store.put(p);
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Lookup a cached product by barcode in IndexedDB when offline
 */
export async function lookupCachedProductOffline(barcode: string): Promise<any | null> {
  const db = await openDB();
  return new Promise((resolve) => {
    const tx = db.transaction(STORE_CATALOG, 'readonly');
    const store = tx.objectStore(STORE_CATALOG);
    const index = store.index('barcode');
    const req = index.get(barcode.trim());

    req.onsuccess = () => {
      if (req.result) {
        resolve(req.result);
        return;
      }
      // If not exact match in index, scan all for loose match (e.g. SKU or cleaned code)
      const allReq = store.getAll();
      allReq.onsuccess = () => {
        const clean = barcode.trim().toLowerCase();
        const found = (allReq.result || []).find(
          (p: any) =>
            (p.barcode && p.barcode.toLowerCase() === clean) ||
            (p.sku && p.sku.toLowerCase() === clean) ||
            (p.article && p.article.toLowerCase() === clean)
        );
        resolve(found || null);
      };
      allReq.onerror = () => resolve(null);
    };
    req.onerror = () => resolve(null);
  });
}

/**
 * Search cached products in IndexedDB when offline
 */
export async function searchCachedProductsOffline(query: string): Promise<any[]> {
  const db = await openDB();
  return new Promise((resolve) => {
    const tx = db.transaction(STORE_CATALOG, 'readonly');
    const store = tx.objectStore(STORE_CATALOG);
    const req = store.getAll();

    req.onsuccess = () => {
      const all = (req.result as any[]) || [];
      if (!query.trim()) {
        resolve(all.slice(0, 30));
        return;
      }
      const q = query.toLowerCase().trim();
      const filtered = all.filter((p) => {
        return (
          (p.name && p.name.toLowerCase().includes(q)) ||
          (p.article && p.article.toLowerCase().includes(q)) ||
          (p.sku && p.sku.toLowerCase().includes(q)) ||
          (p.barcode && p.barcode.toLowerCase().includes(q)) ||
          (p.brand_name && p.brand_name.toLowerCase().includes(q))
        );
      });
      resolve(filtered.slice(0, 30));
    };
    req.onerror = () => resolve([]);
  });
}
