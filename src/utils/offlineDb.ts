// IndexedDB + LocalStorage Persistent Queue & Store-Subdomain-Scoped Product Cache for Offline POS Billing

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
  storeSubdomain?: string; // Strict store subdomain binding
  tenantId?: number | null;
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
const DB_VERSION = 2;
const STORE_SALES = 'offline_sales_queue';
const STORE_CATALOG_LEGACY = 'cached_products';
const STORE_CATALOG = 'cached_products_by_store';

const RESERVED_SLUGS = new Set(['www', 'admin', 'superadmin', 'landing', 'root']);

/**
 * Resolves the active store subdomain from URL path (/app/:slug), query (?domain=),
 * hostname subdomain, or active tenant slug in localStorage.
 */
export function resolveActiveStoreSubdomain(explicitSlug?: string | null): string {
  if (explicitSlug && typeof explicitSlug === 'string') {
    const clean = explicitSlug.trim().toLowerCase();
    if (clean && !RESERVED_SLUGS.has(clean)) {
      return clean;
    }
  }

  if (typeof window !== 'undefined') {
    const pathname = window.location.pathname;
    const match = pathname.match(/^\/app\/([a-z0-9-]+)/i);
    if (match && match[1]) {
      const sub = match[1].toLowerCase();
      if (!RESERVED_SLUGS.has(sub)) return sub;
    }

    const params = new URLSearchParams(window.location.search);
    const domainParam = params.get('domain');
    if (domainParam) {
      const sub = domainParam.split('.')[0].toLowerCase();
      if (sub && !RESERVED_SLUGS.has(sub)) return sub;
    }

    const host = window.location.hostname.toLowerCase();
    if (
      host &&
      host !== 'localhost' &&
      host !== '127.0.0.1' &&
      !host.endsWith('.run.app') &&
      !host.endsWith('.googleusercontent.com')
    ) {
      const parts = host.split('.');
      if (parts.length >= 2) {
        const sub = parts[0];
        if (sub && !RESERVED_SLUGS.has(sub)) return sub;
      }
    }
  }

  if (typeof localStorage !== 'undefined') {
    const activeSlug = localStorage.getItem('shoe_pos_active_tenant_slug');
    if (activeSlug && !RESERVED_SLUGS.has(activeSlug.trim().toLowerCase())) {
      return activeSlug.trim().toLowerCase();
    }
  }

  return 'default';
}

/**
 * Verifies that the current authenticated store user is allowed to access/modify
 * the offline cache for the target store subdomain. Prevents cross-store spoofing.
 */
export function verifyOfflineStoreSubdomain(explicitSlug?: string | null): string {
  const activeSubdomain = resolveActiveStoreSubdomain(explicitSlug);

  if (typeof localStorage !== 'undefined') {
    const scopedUserRaw =
      localStorage.getItem(`pos_current_user:${activeSubdomain}`) ||
      localStorage.getItem('pos_current_user') ||
      localStorage.getItem('shoe_pos_user');
    if (scopedUserRaw) {
      try {
        const parsed = JSON.parse(scopedUserRaw);
        const userSubdomain = String(parsed?.storeSubdomain || parsed?.slug || '')
          .trim()
          .toLowerCase();
        if (
          parsed &&
          parsed.role !== 'SUPER_ADMIN' &&
          userSubdomain &&
          !RESERVED_SLUGS.has(userSubdomain) &&
          activeSubdomain !== 'default' &&
          userSubdomain !== activeSubdomain
        ) {
          throw new Error(
            `Cross-store offline cache access blocked: authenticated for "${userSubdomain}", cannot access "${activeSubdomain}".`
          );
        }
      } catch (err: any) {
        if (err?.message?.includes('Cross-store offline cache access blocked')) {
          throw err;
        }
      }
    }
  }

  return activeSubdomain;
}

/**
 * Normalizes any product object from online catalog or API into a consistent
 * store-scoped POS product structure for offline billing.
 */
export function normalizeCachedProduct(p: any, storeSubdomain: string): any {
  if (!p || p.id === undefined || p.id === null) return null;
  const cleanSubdomain = (storeSubdomain || 'default').trim().toLowerCase();

  const costPrice = Math.max(
    0,
    Math.round(Number(p.costPrice ?? p.cost_price ?? 0) || 0)
  );
  const rawSelling = Math.max(
    0,
    Math.round(Number(p.sellingPrice ?? p.selling_price ?? p.salePrice ?? p.sale_price ?? p.price ?? 0) || 0)
  );
  const rawMax = Math.max(
    0,
    Math.round(Number(p.maxPrice ?? p.max_price ?? p.maxSalePrice ?? p.max_sale_price ?? rawSelling) || 0)
  );
  const rawMin = Math.max(
    0,
    Math.round(Number(p.minPrice ?? p.min_price ?? p.minSalePrice ?? p.min_sale_price ?? rawSelling) || 0)
  );
  const retailPrice = rawSelling > 0 ? rawSelling : rawMax;
  const totalStock = Math.max(
    0,
    Math.round(Number(p.totalStock ?? p.total_stock ?? 0) || 0)
  );

  const article = String(p.article || p.name || '').trim();
  const name = String(p.name || p.article || '').trim();
  const barcode = String(p.barcode || p.sku || '').trim();
  const sku = String(p.sku || p.barcode || article || '').trim();

  return {
    ...p,
    id: Number(p.id),
    cacheKey: `${cleanSubdomain}:${Number(p.id)}`,
    storeSubdomain: cleanSubdomain,
    article,
    name,
    sku,
    barcode,
    brandName: String(p.brandName || p.brand_name || p.brand || '').trim(),
    brand_name: String(p.brand_name || p.brandName || p.brand || '').trim(),
    brandLogo: p.brandLogo || p.brand_logo || '',
    categoryName: String(p.categoryName || p.category_name || p.category || 'General').trim(),
    category_name: String(p.category_name || p.categoryName || p.category || 'General').trim(),
    primaryImageUrl: p.primaryImageUrl || p.primary_image_url || '',
    costPrice,
    cost_price: costPrice,
    sellingPrice: retailPrice,
    selling_price: retailPrice,
    price: retailPrice,
    salePrice: retailPrice,
    sale_price: retailPrice,
    minPrice: rawMin > 0 ? rawMin : retailPrice,
    min_price: rawMin > 0 ? rawMin : retailPrice,
    minSalePrice: rawMin > 0 ? rawMin : retailPrice,
    min_sale_price: rawMin > 0 ? rawMin : retailPrice,
    maxPrice: rawMax > 0 ? rawMax : retailPrice,
    max_price: rawMax > 0 ? rawMax : retailPrice,
    maxSalePrice: rawMax > 0 ? rawMax : retailPrice,
    max_sale_price: rawMax > 0 ? rawMax : retailPrice,
    totalStock,
    total_stock: totalStock,
    lowStockLimit: Number(p.lowStockLimit ?? p.low_stock_limit ?? 5) || 5,
    pricingPolicy: p.pricingPolicy || p.pricing_policy || 'FIXED',
    active: p.active !== false,
    cachedAt: new Date().toISOString(),
  };
}

function getLocalStorageCatalogKey(storeSubdomain: string): string {
  return `pos_offline_catalog:${storeSubdomain.toLowerCase()}`;
}

function saveCatalogMirrorToLocalStorage(storeSubdomain: string, products: any[]): void {
  if (typeof localStorage === 'undefined') return;
  try {
    const key = getLocalStorageCatalogKey(storeSubdomain);
    const existingRaw = localStorage.getItem(key);
    const existingMap = new Map<number, any>();
    if (existingRaw) {
      const parsed = JSON.parse(existingRaw);
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          if (item && item.id !== undefined && item.storeSubdomain === storeSubdomain) {
            existingMap.set(Number(item.id), item);
          }
        }
      }
    }
    for (const prod of products) {
      if (prod && prod.id !== undefined) {
        existingMap.set(Number(prod.id), prod);
      }
    }
    const merged = Array.from(existingMap.values()).slice(0, 600);
    localStorage.setItem(key, JSON.stringify(merged));
  } catch {
    // Ignore storage quota warnings
  }
}

function readCatalogMirrorFromLocalStorage(storeSubdomain: string): any[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(getLocalStorageCatalogKey(storeSubdomain));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((p) => p && (!p.storeSubdomain || p.storeSubdomain === storeSubdomain));
  } catch {
    return [];
  }
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_SALES)) {
        const salesStore = db.createObjectStore(STORE_SALES, { keyPath: 'clientTxId' });
        salesStore.createIndex('status', 'status', { unique: false });
        salesStore.createIndex('createdAt', 'createdAt', { unique: false });
        salesStore.createIndex('storeSubdomain', 'storeSubdomain', { unique: false });
      }
      if (!db.objectStoreNames.contains(STORE_CATALOG_LEGACY)) {
        const legacyStore = db.createObjectStore(STORE_CATALOG_LEGACY, { keyPath: 'id' });
        legacyStore.createIndex('barcode', 'barcode', { unique: false });
      }
      if (!db.objectStoreNames.contains(STORE_CATALOG)) {
        const catalogStore = db.createObjectStore(STORE_CATALOG, { keyPath: 'cacheKey' });
        catalogStore.createIndex('storeSubdomain', 'storeSubdomain', { unique: false });
        catalogStore.createIndex('barcode', 'barcode', { unique: false });
        catalogStore.createIndex('sku', 'sku', { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Save an offline sale to IndexedDB (strictly tagged with the store's subdomain)
 */
export async function queueOfflineSale(sale: QueuedSale, explicitStoreSubdomain?: string | null): Promise<void> {
  const storeSubdomain = verifyOfflineStoreSubdomain(sale.storeSubdomain || explicitStoreSubdomain);
  const scopedSale: QueuedSale = {
    ...sale,
    storeSubdomain,
  };
  const db = await openDB();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_SALES, 'readwrite');
    const store = tx.objectStore(STORE_SALES);
    const req = store.put(scopedSale);

    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });

  // Also deduct local cached stock for this store so subsequent offline bills have accurate stock
  if (Array.isArray(sale.items) && sale.items.length > 0) {
    await deductCachedProductStockOffline(sale.items, storeSubdomain).catch(() => {});
  }
}

/**
 * Get all queued offline sales for the active store subdomain
 */
export async function getOfflineSales(explicitStoreSubdomain?: string | null): Promise<QueuedSale[]> {
  let storeSubdomain = 'default';
  try {
    storeSubdomain = verifyOfflineStoreSubdomain(explicitStoreSubdomain);
  } catch {
    return [];
  }

  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_SALES, 'readonly');
    const store = tx.objectStore(STORE_SALES);
    const req = store.getAll();

    req.onsuccess = () => {
      const allResults = (req.result as QueuedSale[]) || [];
      const results = allResults.filter(
        (s) => !s.storeSubdomain || s.storeSubdomain === storeSubdomain
      );
      results.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      resolve(results);
    };
    req.onerror = () => reject(req.error);
  });
}

/**
 * Get count of pending offline sales for the active store subdomain
 */
export async function getPendingOfflineSalesCount(explicitStoreSubdomain?: string | null): Promise<number> {
  const all = await getOfflineSales(explicitStoreSubdomain);
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
 * Cache products list into store-subdomain-scoped IndexedDB & LocalStorage mirror
 * for offline product search, catalog browsing, and barcode/article billing.
 */
export async function cacheCatalogOffline(
  products: any[],
  explicitStoreSubdomain?: string | null
): Promise<void> {
  if (!Array.isArray(products) || products.length === 0) return;

  let storeSubdomain = 'default';
  try {
    storeSubdomain = verifyOfflineStoreSubdomain(explicitStoreSubdomain);
  } catch {
    return;
  }

  const normalizedList = products
    .map((p) => normalizeCachedProduct(p, storeSubdomain))
    .filter(Boolean);

  if (normalizedList.length === 0) return;

  // 1. Instant synchronous mirror in store-scoped localStorage
  saveCatalogMirrorToLocalStorage(storeSubdomain, normalizedList);

  // 2. Persistent store-scoped IndexedDB write
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_CATALOG, 'readwrite');
      const store = tx.objectStore(STORE_CATALOG);
      for (const item of normalizedList) {
        store.put(item);
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // LocalStorage mirror still serves offline catalog if IndexedDB is blocked
  }
}

/**
 * Deduct stock locally in the store-scoped offline catalog cache when an offline bill is created
 */
export async function deductCachedProductStockOffline(
  items: Array<{ productId: number; quantity: number }>,
  explicitStoreSubdomain?: string | null
): Promise<void> {
  if (!Array.isArray(items) || items.length === 0) return;
  let storeSubdomain = 'default';
  try {
    storeSubdomain = verifyOfflineStoreSubdomain(explicitStoreSubdomain);
  } catch {
    return;
  }

  const qtyByProduct = new Map<number, number>();
  for (const item of items) {
    const pid = Number(item.productId);
    const qty = Number(item.quantity) || 0;
    if (pid && qty > 0) {
      qtyByProduct.set(pid, (qtyByProduct.get(pid) || 0) + qty);
    }
  }
  if (qtyByProduct.size === 0) return;

  const currentMirror = readCatalogMirrorFromLocalStorage(storeSubdomain);
  const updatedItems: any[] = [];
  for (const prod of currentMirror) {
    const deduct = qtyByProduct.get(Number(prod.id));
    if (deduct) {
      const newStock = Math.max(0, (Number(prod.totalStock ?? prod.total_stock ?? 0) || 0) - deduct);
      updatedItems.push({
        ...prod,
        totalStock: newStock,
        total_stock: newStock,
      });
    }
  }
  if (updatedItems.length > 0) {
    saveCatalogMirrorToLocalStorage(storeSubdomain, updatedItems);
  }

  try {
    const db = await openDB();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE_CATALOG, 'readwrite');
      const store = tx.objectStore(STORE_CATALOG);
      for (const [pid, deduct] of qtyByProduct.entries()) {
        const cacheKey = `${storeSubdomain}:${pid}`;
        const getReq = store.get(cacheKey);
        getReq.onsuccess = () => {
          const existing = getReq.result;
          if (existing && existing.storeSubdomain === storeSubdomain) {
            const newStock = Math.max(0, (Number(existing.totalStock ?? existing.total_stock ?? 0) || 0) - deduct);
            existing.totalStock = newStock;
            existing.total_stock = newStock;
            store.put(existing);
          }
        };
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {
    // Ignore IDB errors
  }
}

/**
 * Retrieve all cached catalog products strictly belonging to the active store subdomain
 */
export async function getAllCachedProductsOffline(
  explicitStoreSubdomain?: string | null
): Promise<any[]> {
  let storeSubdomain = 'default';
  try {
    storeSubdomain = verifyOfflineStoreSubdomain(explicitStoreSubdomain);
  } catch {
    return [];
  }

  const byId = new Map<number, any>();

  // 1. Load fast localStorage mirror for this store
  for (const item of readCatalogMirrorFromLocalStorage(storeSubdomain)) {
    const norm = normalizeCachedProduct(item, storeSubdomain);
    if (norm) byId.set(norm.id, norm);
  }

  // 2. Load IndexedDB store-scoped catalog
  try {
    const db = await openDB();
    const idbItems = await new Promise<any[]>((resolve) => {
      const tx = db.transaction(STORE_CATALOG, 'readonly');
      const store = tx.objectStore(STORE_CATALOG);
      const req = store.getAll();
      req.onsuccess = () => {
        const all = (req.result as any[]) || [];
        resolve(all.filter((p) => p && p.storeSubdomain === storeSubdomain));
      };
      req.onerror = () => resolve([]);
    });

    for (const item of idbItems) {
      const norm = normalizeCachedProduct(item, storeSubdomain);
      if (norm) byId.set(norm.id, norm);
    }
  } catch {
    // Fallback to localStorage mirror already populated in byId
  }

  return Array.from(byId.values());
}

/**
 * Lookup a cached product by barcode, SKU, or article name in the store's offline catalog
 */
export async function lookupCachedProductOffline(
  barcodeOrArticle: string,
  explicitStoreSubdomain?: string | null
): Promise<any | null> {
  const clean = String(barcodeOrArticle || '').trim().toLowerCase();
  if (!clean) return null;

  const allStoreProducts = await getAllCachedProductsOffline(explicitStoreSubdomain);
  if (allStoreProducts.length === 0) return null;

  // 1. Exact match on barcode, SKU, article, or product name
  const exactMatch = allStoreProducts.find(
    (p: any) =>
      (p.barcode && String(p.barcode).trim().toLowerCase() === clean) ||
      (p.sku && String(p.sku).trim().toLowerCase() === clean) ||
      (p.article && String(p.article).trim().toLowerCase() === clean) ||
      (p.name && String(p.name).trim().toLowerCase() === clean)
  );
  if (exactMatch) return exactMatch;

  // 2. Prefix or partial match on article, name, SKU, or barcode (so typing an article in offline mode finds it)
  const partialMatch = allStoreProducts.find(
    (p: any) =>
      (p.article && String(p.article).toLowerCase().includes(clean)) ||
      (p.name && String(p.name).toLowerCase().includes(clean)) ||
      (p.sku && String(p.sku).toLowerCase().includes(clean)) ||
      (p.barcode && String(p.barcode).toLowerCase().includes(clean))
  );

  return partialMatch || null;
}

/**
 * Search cached products in IndexedDB/LocalStorage when offline (strictly scoped by store subdomain)
 */
export async function searchCachedProductsOffline(
  query: string,
  explicitStoreSubdomain?: string | null,
  limit = 50
): Promise<any[]> {
  const all = await getAllCachedProductsOffline(explicitStoreSubdomain);
  const q = String(query || '').toLowerCase().trim();
  if (!q) {
    return all.slice(0, limit);
  }

  // Score matches so exact/prefix article matches appear first
  const matched = all.filter((p) => {
    return (
      (p.article && String(p.article).toLowerCase().includes(q)) ||
      (p.name && String(p.name).toLowerCase().includes(q)) ||
      (p.sku && String(p.sku).toLowerCase().includes(q)) ||
      (p.barcode && String(p.barcode).toLowerCase().includes(q)) ||
      (p.brandName && String(p.brandName).toLowerCase().includes(q)) ||
      (p.brand_name && String(p.brand_name).toLowerCase().includes(q)) ||
      (p.categoryName && String(p.categoryName).toLowerCase().includes(q))
    );
  });

  matched.sort((a, b) => {
    const aExact =
      String(a.article || '').toLowerCase() === q ||
      String(a.barcode || '').toLowerCase() === q ||
      String(a.sku || '').toLowerCase() === q;
    const bExact =
      String(b.article || '').toLowerCase() === q ||
      String(b.barcode || '').toLowerCase() === q ||
      String(b.sku || '').toLowerCase() === q;
    if (aExact && !bExact) return -1;
    if (!aExact && bExact) return 1;
    return 0;
  });

  return matched.slice(0, limit);
}

