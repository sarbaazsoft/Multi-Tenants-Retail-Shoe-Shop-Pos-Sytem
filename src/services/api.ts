// Central API service with JWT token injection, Multi-Tenant context headers, and error handling

const TOKEN_KEY = 'pos_auth_token';
const ALT_TOKEN_KEY = 'shoe_pos_jwt_token';
const USER_KEY = 'pos_current_user';
const ALT_USER_KEY = 'shoe_pos_user';
const ACTIVE_TENANT_SLUG_KEY = 'shoe_pos_active_tenant_slug';

export function getAuthToken(): string | null {
  return localStorage.getItem(TOKEN_KEY) || localStorage.getItem(ALT_TOKEN_KEY);
}

export function getToken(): string | null {
  return getAuthToken();
}

export function setAuthToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(ALT_TOKEN_KEY, token);
}

export function removeAuthToken() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(ALT_TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  localStorage.removeItem(ALT_USER_KEY);
}

export function setAuthSession(token: string, user: any) {
  setAuthToken(token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
  localStorage.setItem(ALT_USER_KEY, JSON.stringify(user));
  if (user && user.slug && user.slug !== 'admin') {
    localStorage.setItem(ACTIVE_TENANT_SLUG_KEY, user.slug);
  }
}

export function clearAuthSession() {
  removeAuthToken();
}

export function getStoredUser() {
  const raw = localStorage.getItem(USER_KEY) || localStorage.getItem(ALT_USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function getActiveTenantSlug(): string | null {
  if (typeof window !== 'undefined') {
    const pathname = window.location.pathname;
    if (
      pathname === '/admin' ||
      pathname.startsWith('/admin/') ||
      pathname === '/landing' ||
      pathname.startsWith('/landing/')
    ) {
      return null;
    }
    const match = pathname.match(/^\/app\/([a-z0-9-]+)/i);
    if (match) {
      return match[1].toLowerCase();
    }
    const params = new URLSearchParams(window.location.search);
    const domainParam = params.get('domain');
    if (domainParam) {
      const sub = domainParam.split('.')[0].toLowerCase();
      if (sub === 'admin') return null;
      if (sub && sub !== 'www') return sub;
    }
  }
  const stored = localStorage.getItem(ACTIVE_TENANT_SLUG_KEY);
  if (stored && ['admin', 'superadmin', 'landing', 'root'].includes(stored.toLowerCase())) {
    return null;
  }
  return stored;
}

export function setActiveTenantSlug(slug: string | null) {
  if (!slug) {
    localStorage.removeItem(ACTIVE_TENANT_SLUG_KEY);
  } else {
    localStorage.setItem(ACTIVE_TENANT_SLUG_KEY, slug.toLowerCase());
  }
}

interface RequestOptions extends RequestInit {
  body?: any;
  tenantSlug?: string | null;
}

export async function apiFetch<T = any>(endpoint: string, options: RequestOptions = {}): Promise<T> {
  const token = getAuthToken();
  const activeSlug = options.tenantSlug !== undefined ? options.tenantSlug : getActiveTenantSlug();
  const cleanSlug =
    activeSlug &&
    !['admin', 'superadmin', 'landing', 'root'].includes(String(activeSlug).toLowerCase())
      ? String(activeSlug)
      : null;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((options.headers as Record<string, string>) || {}),
  };

  if (token) {
    headers['X-Auth-Token'] = token;
  }

  if (cleanSlug) {
    headers['X-Tenant-Slug'] = cleanSlug;
  }

  const { tenantSlug: _ignoredTenantSlug, body: rawBody, ...restOptions } = options;
  const method = (restOptions.method || 'GET').toUpperCase();
  const serializedBody =
    rawBody === undefined || rawBody === null
      ? undefined
      : typeof rawBody === 'object'
      ? JSON.stringify(rawBody)
      : typeof rawBody === 'number' || typeof rawBody === 'boolean'
      ? JSON.stringify({ value: rawBody })
      : (rawBody as BodyInit);

  const config: RequestInit = {
    ...restOptions,
    method,
    credentials: 'include',
    cache: 'no-store',
    headers,
    ...(serializedBody !== undefined ? { body: serializedBody } : {}),
  };

  let response = await fetch(`/api${endpoint}`, config);
  let contentType = response.headers.get('content-type') || '';

  // If an iframe proxy or service worker intercepts POST/PUT/PATCH/DELETE or custom headers with non-JSON 403/error,
  // automatically retry via GET RPC query bridge so authentication & mutations succeed reliably.
  if (!contentType.includes('application/json') && !response.ok) {
    try {
      const separator = endpoint.includes('?') ? '&' : '?';
      const fallbackParams = new URLSearchParams();
      if (method !== 'GET') {
        fallbackParams.set('__method', method);
      }
      if (typeof serializedBody === 'string' && serializedBody.length < 6000) {
        fallbackParams.set('__body', serializedBody);
      }
      if (token) {
        fallbackParams.set('__token', token);
      }
      if (cleanSlug) {
        fallbackParams.set('__tenant', cleanSlug);
      }
      fallbackParams.set('_t', String(Date.now()));

      const fallbackUrl = `/api${endpoint}${separator}${fallbackParams.toString()}`;
      const fallbackRes = await fetch(fallbackUrl, {
        method: 'GET',
        credentials: 'include',
        cache: 'no-store',
      });
      const fallbackType = fallbackRes.headers.get('content-type') || '';
      if (fallbackType.includes('application/json') || fallbackRes.ok) {
        response = fallbackRes;
        contentType = fallbackType;
      }
    } catch {
      // Keep original response if fallback fails
    }
  }

  if (!contentType.includes('application/json')) {
    if (!response.ok) {
      throw new Error(`Server Error (${response.status}): Endpoint /api${endpoint} unavailable.`);
    }
    throw new Error('Unexpected non-JSON response from server.');
  }

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    if (response.status === 401 && !endpoint.includes('/auth/login')) {
      clearAuthSession();
    }
    if (data?.code === 'SUBSCRIPTION_EXPIRED' && typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('tenant:subscription-expired', { detail: data }));
    }
    throw new Error(data.error || `API Error (${response.status})`);
  }

  return data as T;
}

export const api = {
  // Multi-Tenant SaaS & Onboarding Endpoints
  saas: {
    resolve: (params?: { domain?: string; slug?: string }) => {
      const qs = new URLSearchParams();
      if (params?.domain) qs.set('domain', params.domain);
      const query = qs.toString() ? `?${qs.toString()}` : '';
      return apiFetch(`/saas/resolve${query}`, {
        tenantSlug: params?.slug ?? undefined,
      });
    },
    submitStoreRequest: (data: {
      storeName: string;
      requestedSlug: string;
      ownerName: string;
      ownerEmail: string;
      ownerPhone?: string;
      plan?: string;
    }) => apiFetch('/saas/store-requests', { method: 'POST', body: data }),
    getManifest: (slug: string) => apiFetch(`/tenants/${encodeURIComponent(slug)}/manifest`),
    getOnboarding: (slug: string) => apiFetch(`/tenants/${encodeURIComponent(slug)}/onboarding`),
    completeOnboarding: (slug: string, data: any) =>
      apiFetch(`/tenants/${encodeURIComponent(slug)}/onboarding`, {
        method: 'POST',
        body: data,
      }),
  },

  // SuperAdmin Control Panel Endpoints
  superAdmin: {
    getOverview: () => apiFetch('/superadmin/overview'),
    toggleTenantStatus: (tenantId: number, status: 'ACTIVE' | 'SUSPENDED' | 'EXPIRED') =>
      apiFetch(`/superadmin/tenants/${tenantId}/status`, {
        method: 'PATCH',
        body: { status },
      }),
    updateTenantSubscription: (
      tenantId: number,
      data: {
        storeName?: string;
        ownerName?: string;
        ownerEmail?: string;
        ownerPhone?: string;
        subscriptionPlan?: '6_MONTHS' | 'YEARLY' | string;
        subscriptionStartDate?: string;
        subscriptionEndDate?: string;
        subscriptionStatus?: 'ACTIVE' | 'EXPIRED' | 'SUSPENDED';
        appKey?: string;
        regenerateKey?: boolean;
        renewFromNow?: boolean;
      }
    ) =>
      apiFetch(`/superadmin/tenants/${tenantId}/subscription`, {
        method: 'PATCH',
        body: data,
      }),
    regenerateTenantKey: (tenantId: number) =>
      apiFetch<{
        success: boolean;
        appKey: string;
        message: string;
        tenant: any;
      }>(`/superadmin/tenants/${tenantId}/regenerate-key`, {
        method: 'POST',
      }),
    deleteTenant: (tenantId: number) =>
      apiFetch(`/superadmin/tenants/${tenantId}/delete`, {
        method: 'POST',
      }),
    exportTenantSql: (tenantId: number) =>
      apiFetch<{
        success: boolean;
        filename: string;
        storeName: string;
        slug: string;
        totalRows: number;
        sql: string;
      }>(`/superadmin/tenants/${tenantId}/export-sql`),
    exportPlatformSql: () =>
      apiFetch<{
        success: boolean;
        filename: string;
        totalRows: number;
        sql: string;
      }>('/superadmin/export-sql'),
    createTenant: (data: {
      storeName: string;
      slug: string;
      ownerName: string;
      ownerEmail: string;
      password?: string;
      ownerPhone?: string;
      themeColor?: string;
      currency?: string;
      subscriptionPlan?: '6_MONTHS' | 'YEARLY' | string;
      appKey?: string;
      subscriptionStartDate?: string;
      subscriptionEndDate?: string;
    }) => apiFetch('/superadmin/tenants', { method: 'POST', body: data }),
    approveRequest: (
      requestId: number,
      data?: { password?: string; slug?: string; storeName?: string; subscriptionPlan?: '6_MONTHS' | 'YEARLY' | string }
    ) =>
      apiFetch(`/superadmin/store-requests/${requestId}/approve`, {
        method: 'POST',
        body: data || {},
      }),
    rejectRequest: (requestId: number) =>
      apiFetch(`/superadmin/store-requests/${requestId}/reject`, {
        method: 'POST',
      }),
    updateRequest: (
      requestId: number,
      data: {
        status?: 'PENDING' | 'APPROVED' | 'REJECTED';
        storeName?: string;
        requestedSlug?: string;
        ownerName?: string;
        ownerEmail?: string;
        ownerPhone?: string;
        plan?: string;
      }
    ) =>
      apiFetch(`/superadmin/store-requests/${requestId}`, {
        method: 'PATCH',
        body: data,
      }),
    deleteRequest: (requestId: number) =>
      apiFetch(`/superadmin/store-requests/${requestId}/delete`, {
        method: 'POST',
      }),
  },

  install: {
    status: () => apiFetch<any>('/install/status'),
    reset: (password: string, email?: string, dropTables?: boolean) =>
      apiFetch('/install/reset', { method: 'POST', body: { password, email, dropTables } }),
    dropTables: (password: string) =>
      apiFetch('/install/drop-tables', { method: 'POST', body: { password } }),
    lock: (password?: string) =>
      apiFetch('/install/lock', { method: 'POST', body: { password } }),
  },
  auth: {
    login: (credentials: any) =>
      apiFetch('/auth/login', {
        method: 'POST',
        body: credentials,
        tenantSlug: credentials?.tenantSlug ?? null,
      }),
    getStoreCredentials: (slug?: string) =>
      apiFetch<any>(`/auth/store-credentials${slug ? `?slug=${encodeURIComponent(slug)}` : ''}`, {
        tenantSlug: slug || undefined,
      }),
    signup: (data: any) => apiFetch('/auth/signup', { method: 'POST', body: data }),
    forgotPassword: (data: { email: string }) =>
      apiFetch('/auth/forgot-password', { method: 'POST', body: data }),
    resetPassword: (data: { email: string; token: string; newPassword: string }) =>
      apiFetch('/auth/reset-password', { method: 'POST', body: data }),
    changePassword: (data: { currentPassword?: string; newPassword: string; confirmPassword?: string }) =>
      apiFetch('/auth/change-password', { method: 'PUT', body: data }),
    me: () => apiFetch('/auth/me'),
    updateProfile: (data: any) => apiFetch('/auth/profile', { method: 'PUT', body: data }),
    listUsers: () => apiFetch('/auth/users'),
    createUser: (data: any) => apiFetch('/auth/users', { method: 'POST', body: data }),
    updateUser: (id: number, data: any) => apiFetch(`/auth/users/${id}`, { method: 'PUT', body: data }),
    approveUser: (id: number, status: 'APPROVED' | 'PENDING') =>
      apiFetch(`/auth/users/${id}/status`, { method: 'PATCH', body: { status } }),
    deleteUser: (id: number) => apiFetch(`/auth/users/${id}`, { method: 'DELETE' }),
    listApiTokens: () => apiFetch('/auth/api-tokens'),
    createApiToken: (name: string) => apiFetch('/auth/api-tokens', { method: 'POST', body: { name } }),
    deleteApiToken: (id: number) => apiFetch(`/auth/api-tokens/${id}`, { method: 'DELETE' }),
  },
  products: {
    list: (params?: { search?: string; category?: string; brand?: string; lowStock?: boolean; lowStockOnly?: boolean; limit?: number }) => {
      const qs = new URLSearchParams();
      if (params?.search) qs.set('search', params.search);
      if (params?.category) qs.set('category', params.category);
      if (params?.brand) qs.set('brand', params.brand);
      if (params?.lowStock || params?.lowStockOnly) qs.set('lowStockOnly', 'true');
      if (params?.limit) qs.set('limit', String(params.limit));
      const query = qs.toString() ? `?${qs.toString()}` : '';
      return apiFetch(`/products${query}`);
    },
    scanBarcode: (code: string) => apiFetch(`/products/barcode/${encodeURIComponent(code)}`),
    lookupBarcode: (code: string) => apiFetch(`/products/barcode/${encodeURIComponent(code)}`),
    getByBarcode: (code: string) => apiFetch(`/products/barcode/${encodeURIComponent(code)}`),
    getNextId: () => apiFetch('/products/next-id'),
    generateBarcode: (data?: number | string | { productId?: number | string }) => {
      const productId =
        typeof data === 'number' || typeof data === 'string'
          ? data
          : data?.productId;
      const qs = productId !== undefined && productId !== null && productId !== ''
        ? `?productId=${encodeURIComponent(String(productId))}`
        : '';
      return apiFetch(`/products/generate-barcode${qs}`);
    },
    validateBarcode: (barcode: string, excludeId?: number) => {
      const qs = new URLSearchParams({ barcode: String(barcode || '') });
      if (excludeId !== undefined && excludeId !== null) {
        qs.set('excludeId', String(excludeId));
      }
      return apiFetch(`/products/validate-barcode?${qs.toString()}`);
    },
    getById: (id: number) => apiFetch(`/products/${id}`),
    get: (id: number) => apiFetch(`/products/${id}`),
    create: (data: any) => apiFetch('/products', { method: 'POST', body: data }),
    bulkImport: (payload: any) =>
      apiFetch('/products/bulk-import', {
        method: 'POST',
        body: Array.isArray(payload) ? { products: payload } : payload,
      }),
    aiSuggest: (imageInput: string | { image?: string; imageBase64?: string; imageUrl?: string }) => {
      const resolved =
        typeof imageInput === 'string'
          ? { image: imageInput, imageBase64: imageInput }
          : {
              image: imageInput?.image || imageInput?.imageBase64 || imageInput?.imageUrl || '',
              imageBase64: imageInput?.imageBase64 || imageInput?.image || imageInput?.imageUrl || '',
            };
      return apiFetch('/products/ai-suggest', { method: 'POST', body: resolved });
    },
    suggestFromImage: (imageInput: string | { image?: string; imageBase64?: string; imageUrl?: string }) => {
      const resolved =
        typeof imageInput === 'string'
          ? { image: imageInput, imageBase64: imageInput }
          : {
              image: imageInput?.image || imageInput?.imageBase64 || imageInput?.imageUrl || '',
              imageBase64: imageInput?.imageBase64 || imageInput?.image || imageInput?.imageUrl || '',
            };
      return apiFetch('/products/ai-suggest', { method: 'POST', body: resolved });
    },
    nextCode: (brand?: string, category?: string) => {
      const qs = new URLSearchParams();
      if (brand) qs.set('brand', brand);
      if (category) qs.set('category', category);
      return apiFetch(`/products/next-code?${qs.toString()}`);
    },
    update: (id: number, data: any) => apiFetch(`/products/${id}`, { method: 'PUT', body: data }),
    delete: (id: number) => apiFetch(`/products/${id}`, { method: 'DELETE' }),
  },
  brandCategory: {
    getBrands: () => apiFetch('/brands'),
    createBrand: (name: string) => apiFetch('/brands', { method: 'POST', body: { name } }),
    deleteBrand: (id: number) => apiFetch(`/brands/${id}`, { method: 'DELETE' }),
    getCategories: () => apiFetch('/categories'),
    createCategory: (name: string) => apiFetch('/categories', { method: 'POST', body: { name } }),
    deleteCategory: (id: number) => apiFetch(`/categories/${id}`, { method: 'DELETE' }),
  },
  pos: {
    verifyOverride: (credentials: { email?: string; password?: string; pin?: string }) =>
      apiFetch('/pos/verify-override', { method: 'POST', body: credentials }),
    createSale: (saleData: any) => apiFetch('/pos/sales', { method: 'POST', body: saleData }),
    checkout: (saleData: any) => apiFetch('/pos/checkout', { method: 'POST', body: saleData }),
    exchange: (exchangeData: any) => apiFetch('/pos/exchange', { method: 'POST', body: exchangeData }),
    listSales: (params?: { startDate?: string; endDate?: string; search?: string; limit?: number }) => {
      const qs = new URLSearchParams();
      if (params?.startDate) qs.set('startDate', params.startDate);
      if (params?.endDate) qs.set('endDate', params.endDate);
      if (params?.search) qs.set('search', params.search);
      if (params?.limit) qs.set('limit', String(params.limit));
      const query = qs.toString() ? `?${qs.toString()}` : '';
      return apiFetch(`/pos/sales${query}`);
    },
    getSale: (id: number) => apiFetch(`/pos/sales/${id}`),
    getSaleByInvoice: (invoiceNumber: string) =>
      apiFetch(`/pos/invoice/${encodeURIComponent(invoiceNumber)}`),
  },
  returns: {
    verifyInvoice: (invoiceNumber: string) =>
      apiFetch(`/returns/verify-invoice/${encodeURIComponent(invoiceNumber)}`),
    createReturn: (data: any) => apiFetch('/returns', { method: 'POST', body: data }),
    create: (data: any) => apiFetch('/returns', { method: 'POST', body: data }),
    listReturns: (search?: string) => {
      const query = search ? `?search=${encodeURIComponent(search)}` : '';
      return apiFetch(`/returns${query}`);
    },
    list: (search?: string) => {
      const query = search ? `?search=${encodeURIComponent(search)}` : '';
      return apiFetch(`/returns${query}`);
    },
    getReturn: (id: number) => apiFetch(`/returns/${id}`),
    get: (id: number) => apiFetch(`/returns/${id}`),
  },
  suppliers: {
    list: (search?: string | { search?: string }) => {
      const term = typeof search === 'string' ? search : search?.search;
      const query = term ? `?search=${encodeURIComponent(term)}` : '';
      return apiFetch(`/suppliers${query}`);
    },
    get: (id: number) => apiFetch(`/suppliers/${id}`),
    getById: (id: number) => apiFetch(`/suppliers/${id}`),
    getLedger: (id: number) => apiFetch(`/suppliers/${id}/ledger`),
    create: (data: any) => apiFetch('/suppliers', { method: 'POST', body: data }),
    recordPayment: (id: number, data: any) =>
      apiFetch(`/suppliers/${id}/payments`, { method: 'POST', body: data }),
    deletePayment: (idOrSupplierId: number, maybePaymentId?: number) => {
      if (maybePaymentId !== undefined) {
        return apiFetch(`/suppliers/${idOrSupplierId}/payments/${maybePaymentId}`, { method: 'DELETE' });
      }
      return apiFetch(`/suppliers/payments/${idOrSupplierId}`, { method: 'DELETE' });
    },
    update: (id: number, data: any) => apiFetch(`/suppliers/${id}`, { method: 'PUT', body: data }),
    delete: (id: number) => apiFetch(`/suppliers/${id}`, { method: 'DELETE' }),
  },
  purchases: {
    create: (data: any) => apiFetch('/purchases', { method: 'POST', body: data }),
    list: (search?: string | { search?: string }) => {
      const term = typeof search === 'string' ? search : search?.search;
      const query = term ? `?search=${encodeURIComponent(term)}` : '';
      return apiFetch(`/purchases${query}`);
    },
    getById: (id: number) => apiFetch(`/purchases/${id}`),
    get: (id: number) => apiFetch(`/purchases/${id}`),
  },
  purchaseReturns: {
    create: (data: any) => apiFetch('/purchase-returns', { method: 'POST', body: data }),
    verifyPurchase: (purchaseNumber: string) =>
      apiFetch(`/purchase-returns/verify-purchase/${encodeURIComponent(purchaseNumber)}`),
    list: (search?: string | { search?: string }) => {
      const term = typeof search === 'string' ? search : search?.search;
      const query = term ? `?search=${encodeURIComponent(term)}` : '';
      return apiFetch(`/purchase-returns${query}`);
    },
    getById: (id: number) => apiFetch(`/purchase-returns/${id}`),
    get: (id: number) => apiFetch(`/purchase-returns/${id}`),
  },
  customers: {
    list: (search?: string) => {
      const query = search ? `?search=${encodeURIComponent(search)}` : '';
      return apiFetch(`/customers${query}`);
    },
    getById: (id: number) => apiFetch(`/customers/${id}`),
    get: (id: number) => apiFetch(`/customers/${id}`),
    create: (data: any) => apiFetch('/customers', { method: 'POST', body: data }),
    update: (id: number, data: any) => apiFetch(`/customers/${id}`, { method: 'PUT', body: data }),
    delete: (id: number) => apiFetch(`/customers/${id}`, { method: 'DELETE' }),
  },
  inventory: {
    listMovements: (params?: { productId?: number; type?: string; movementType?: string; search?: string; limit?: number }) => {
      const qs = new URLSearchParams();
      if (params?.productId) qs.set('productId', String(params.productId));
      if (params?.type || params?.movementType) qs.set('movementType', String(params.type || params.movementType));
      if (params?.search) qs.set('search', params.search);
      if (params?.limit) qs.set('limit', String(params.limit));
      const query = qs.toString() ? `?${qs.toString()}` : '';
      return apiFetch(`/inventory/ledger${query}`);
    },
    ledger: (params?: { productId?: number; movementType?: string; limit?: number }) => {
      const qs = new URLSearchParams();
      if (params?.productId) qs.set('productId', String(params.productId));
      if (params?.movementType) qs.set('movementType', String(params.movementType));
      if (params?.limit) qs.set('limit', String(params.limit));
      const query = qs.toString() ? `?${qs.toString()}` : '';
      return apiFetch(`/inventory/ledger${query}`);
    },
    adjustStock: (data: { productId: number; newStock: number; reason: string }) =>
      apiFetch('/inventory/adjust', { method: 'POST', body: data }),
    adjust: (data: { productId: number; newStock: number; reason: string }) =>
      apiFetch('/inventory/adjust', { method: 'POST', body: data }),
  },
  reports: {
    dashboard: () => apiFetch('/reports/dashboard'),
    getDashboard: () => apiFetch('/reports/dashboard'),
    profitLoss: (params?: { startDate?: string; endDate?: string }) => {
      const qs = new URLSearchParams();
      if (params?.startDate) qs.set('startDate', params.startDate);
      if (params?.endDate) qs.set('endDate', params.endDate);
      const query = qs.toString() ? `?${qs.toString()}` : '';
      return apiFetch(`/reports/profit-loss${query}`);
    },
    getProfitLoss: (params?: { startDate?: string; endDate?: string }) => {
      const qs = new URLSearchParams();
      if (params?.startDate) qs.set('startDate', params.startDate);
      if (params?.endDate) qs.set('endDate', params.endDate);
      const query = qs.toString() ? `?${qs.toString()}` : '';
      return apiFetch(`/reports/profit-loss${query}`);
    },
    topSelling: () => apiFetch('/reports/top-selling'),
    getTopSelling: () => apiFetch('/reports/top-selling'),
  },
  settings: {
    get: () => apiFetch('/settings'),
    getSubscription: () => apiFetch('/settings/subscription'),
    requestSubscriptionRenewal: (data: { plan: '6_MONTHS' | 'YEARLY' | string; notes?: string }) =>
      apiFetch('/settings/renew-subscription', { method: 'POST', body: data }),
    update: (data: any) => apiFetch('/settings', { method: 'PUT', body: data }),
    getUsers: () => apiFetch('/settings/users'),
    createUser: (data: any) => apiFetch('/settings/users', { method: 'POST', body: data }),
    updateUserStatus: (id: number, status: string) =>
      apiFetch(`/settings/users/${id}/status`, { method: 'PATCH', body: { status } }),
    updateUserRole: (id: number, role: string) =>
      apiFetch(`/settings/users/${id}/role`, { method: 'PATCH', body: { role } }),
    deleteUser: (id: number) => apiFetch(`/settings/users/${id}`, { method: 'DELETE' }),
  },
  backup: {
    stats: () => apiFetch('/backup/stats'),
    export: () => apiFetch('/backup/export'),
    restore: (backupPayload: any) =>
      apiFetch('/backup/restore', { method: 'POST', body: backupPayload }),
    importSql: (sqlContent: string) =>
      apiFetch('/backup/import-sql', { method: 'POST', body: { sql: sqlContent, sqlContent } }),
  },
  notifications: {
    list: () => apiFetch('/notifications'),
  },
  chat: {
    message: (data: { message: string; history?: { role: 'user' | 'assistant'; content: string }[] }) =>
      apiFetch('/chat', { method: 'POST', body: data }),
    send: (payload: any, history?: any) =>
      apiFetch('/chat', {
        method: 'POST',
        body: typeof payload === 'string' ? { message: payload, history } : payload,
      }),
  },
};
