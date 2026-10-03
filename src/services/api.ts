// Central API service with JWT token injection, Multi-Tenant Store Subdomain isolation, and Offline Catalog fallback
import {
  cacheCatalogOffline,
  lookupCachedProductOffline,
  searchCachedProductsOffline,
} from '../utils/offlineDb.ts';

const TOKEN_KEY = 'pos_auth_token';
const ALT_TOKEN_KEY = 'shoe_pos_jwt_token';
const USER_KEY = 'pos_current_user';
const ALT_USER_KEY = 'shoe_pos_user';
const ACTIVE_TENANT_SLUG_KEY = 'shoe_pos_active_tenant_slug';

const RESERVED_SLUGS = new Set(['admin', 'superadmin', 'landing', 'root', 'www', 'default']);

function decodeTokenPayload(token: string): any | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const json = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    return JSON.parse(json);
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
        if (sub === 'admin') return null;
        if (sub && !RESERVED_SLUGS.has(sub)) return sub;
      }
    }
  }
  const stored = localStorage.getItem(ACTIVE_TENANT_SLUG_KEY);
  if (stored && RESERVED_SLUGS.has(stored.toLowerCase())) {
    return null;
  }
  return stored ? stored.toLowerCase() : null;
}

export function setActiveTenantSlug(slug: string | null) {
  if (!slug || RESERVED_SLUGS.has(slug.toLowerCase())) {
    localStorage.removeItem(ACTIVE_TENANT_SLUG_KEY);
  } else {
    localStorage.setItem(ACTIVE_TENANT_SLUG_KEY, slug.toLowerCase());
  }
}

export function getAuthToken(explicitStoreSlug?: string | null): string | null {
  const activeSlug =
    explicitStoreSlug !== undefined ? explicitStoreSlug : getActiveTenantSlug();
  const cleanSlug =
    activeSlug && !RESERVED_SLUGS.has(activeSlug.toLowerCase())
      ? activeSlug.toLowerCase()
      : null;

  // 1. If in a specific store context, prefer the store-scoped token
  if (cleanSlug) {
    const scopedToken = localStorage.getItem(`${TOKEN_KEY}:${cleanSlug}`);
    if (scopedToken) {
      return scopedToken;
    }
  }

  // 2. Fallback to global token ONLY if its embedded storeSubdomain/slug matches active store (or user is SUPER_ADMIN)
  const globalToken = localStorage.getItem(TOKEN_KEY) || localStorage.getItem(ALT_TOKEN_KEY);
  if (!globalToken) return null;

  if (cleanSlug) {
    const decoded = decodeTokenPayload(globalToken);
    if (decoded && decoded.role !== 'SUPER_ADMIN') {
      const tokenSubdomain = String(decoded.storeSubdomain || decoded.slug || '')
        .trim()
        .toLowerCase();
      if (tokenSubdomain && !RESERVED_SLUGS.has(tokenSubdomain) && tokenSubdomain !== cleanSlug) {
        // Prevent cross-store token leakage between Store 1 and Store 2
        return null;
      }
    }
  }

  return globalToken;
}

export function getToken(): string | null {
  return getAuthToken();
}

export function setAuthToken(token: string, explicitStoreSlug?: string | null) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(ALT_TOKEN_KEY, token);

  const decoded = decodeTokenPayload(token);
  const slug =
    explicitStoreSlug ||
    decoded?.storeSubdomain ||
    decoded?.slug ||
    getActiveTenantSlug();
  if (slug && !RESERVED_SLUGS.has(String(slug).toLowerCase())) {
    localStorage.setItem(`${TOKEN_KEY}:${String(slug).toLowerCase()}`, token);
  }
}

export function removeAuthToken(explicitStoreSlug?: string | null) {
  const activeSlug = explicitStoreSlug || getActiveTenantSlug();
  if (activeSlug && !RESERVED_SLUGS.has(activeSlug.toLowerCase())) {
    localStorage.removeItem(`${TOKEN_KEY}:${activeSlug.toLowerCase()}`);
    localStorage.removeItem(`${USER_KEY}:${activeSlug.toLowerCase()}`);
  }
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(ALT_TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  localStorage.removeItem(ALT_USER_KEY);
}

export function setAuthSession(token: string, user: any) {
  const userSlug = String(user?.storeSubdomain || user?.slug || getActiveTenantSlug() || '')
    .trim()
    .toLowerCase();
  const cleanSlug = userSlug && !RESERVED_SLUGS.has(userSlug) ? userSlug : null;

  setAuthToken(token, cleanSlug);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
  localStorage.setItem(ALT_USER_KEY, JSON.stringify(user));
  if (cleanSlug) {
    localStorage.setItem(`${USER_KEY}:${cleanSlug}`, JSON.stringify(user));
    localStorage.setItem(ACTIVE_TENANT_SLUG_KEY, cleanSlug);
  }
}

export function clearAuthSession() {
  removeAuthToken();
}

export function getStoredUser(explicitStoreSlug?: string | null) {
  const activeSlug =
    explicitStoreSlug !== undefined ? explicitStoreSlug : getActiveTenantSlug();
  const cleanSlug =
    activeSlug && !RESERVED_SLUGS.has(activeSlug.toLowerCase())
      ? activeSlug.toLowerCase()
      : null;

  if (cleanSlug) {
    const scopedRaw = localStorage.getItem(`${USER_KEY}:${cleanSlug}`);
    if (scopedRaw) {
      try {
        return JSON.parse(scopedRaw);
      } catch {
        // continue
      }
    }
  }

  const raw = localStorage.getItem(USER_KEY) || localStorage.getItem(ALT_USER_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (cleanSlug && parsed && parsed.role !== 'SUPER_ADMIN') {
      const userSlug = String(parsed.storeSubdomain || parsed.slug || '')
        .trim()
        .toLowerCase();
      if (userSlug && !RESERVED_SLUGS.has(userSlug) && userSlug !== cleanSlug) {
        // Prevent cross-store session spoofing
        return null;
      }
    }
    return parsed;
  } catch {
    return null;
  }
}

interface RequestOptions extends RequestInit {
  body?: any;
  tenantSlug?: string | null;
}

export async function apiFetch<T = any>(endpoint: string, options: RequestOptions = {}): Promise<T> {
  const activeSlug = options.tenantSlug !== undefined ? options.tenantSlug : getActiveTenantSlug();
  const cleanSlug =
    activeSlug &&
    !RESERVED_SLUGS.has(String(activeSlug).toLowerCase())
      ? String(activeSlug).toLowerCase()
      : null;
  const token = getAuthToken(cleanSlug);

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((options.headers as Record<string, string>) || {}),
  };

  if (token) {
    headers['X-Auth-Token'] = token;
  }

  if (cleanSlug) {
    headers['X-Tenant-Slug'] = cleanSlug;
    headers['X-Store-Subdomain'] = cleanSlug;
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

  let response: Response | null = null;
  let contentType = '';
  let lastNetworkError: any = null;

  const isBrowserOffline = typeof navigator !== 'undefined' && navigator.onLine === false;

  // Retry transient network errors or 502/503/504 gateway responses when online; fail fast when offline
  const retryDelays = isBrowserOffline ? [0] : [0, 400, 800, 1400, 2200, 3200];
  for (let attempt = 0; attempt < retryDelays.length; attempt++) {
    if (retryDelays[attempt] > 0) {
      await new Promise((r) => setTimeout(r, retryDelays[attempt]));
    }
    try {
      const candidate = await fetch(`/api${endpoint}`, config);
      const candType = candidate.headers.get('content-type') || '';
      if (
        (candidate.status === 502 || candidate.status === 503 || candidate.status === 504) &&
        attempt < retryDelays.length - 1
      ) {
        continue;
      }
      response = candidate;
      contentType = candType;
      lastNetworkError = null;
      break;
    } catch (err: any) {
      lastNetworkError = err;
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        break;
      }
    }
  }

  // If an iframe proxy or service worker intercepts POST/PUT/PATCH/DELETE or custom headers with non-JSON 403/error
  // or network reset, automatically retry via GET RPC query bridge so authentication & mutations succeed reliably.
  if (
    !isBrowserOffline &&
    (!response || (!contentType.includes('application/json') && !response.ok))
  ) {
    const fallbackDelays = [0, 600, 1400];
    for (let fbAttempt = 0; fbAttempt < fallbackDelays.length; fbAttempt++) {
      if (fallbackDelays[fbAttempt] > 0) {
        await new Promise((r) => setTimeout(r, fallbackDelays[fbAttempt]));
      }
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
          fallbackParams.set('__subdomain', cleanSlug);
        }
        fallbackParams.set('_t', String(Date.now()));

        const fallbackUrl = `/api${endpoint}${separator}${fallbackParams.toString()}`;
        const fallbackRes = await fetch(fallbackUrl, {
          method: 'GET',
          credentials: 'include',
          cache: 'no-store',
        });
        const fallbackType = fallbackRes.headers.get('content-type') || '';
        if (
          (fallbackRes.status === 502 || fallbackRes.status === 503 || fallbackRes.status === 504) &&
          fbAttempt < fallbackDelays.length - 1
        ) {
          continue;
        }
        if (!response || fallbackType.includes('application/json') || fallbackRes.ok) {
          response = fallbackRes;
          contentType = fallbackType;
          lastNetworkError = null;
        }
        break;
      } catch (fallbackErr: any) {
        if (!lastNetworkError) {
          lastNetworkError = fallbackErr;
        }
      }
    }
  }

  if (!response) {
    throw new Error(
      lastNetworkError?.message && !String(lastNetworkError.message).includes('Failed to fetch')
        ? lastNetworkError.message
        : 'Server is temporarily reconnecting. Please try again in a moment.'
    );
  }

  if (!contentType.includes('application/json')) {
    if (!response.ok) {
      throw new Error(`Server Error (${response.status}): Endpoint /api${endpoint} unavailable.`);
    }
    throw new Error('Unexpected non-JSON response from server.');
  }

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    if (response.status === 401 && !endpoint.includes('/auth/') && !endpoint.includes('/login')) {
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
    storeLogin: (credentials: {
      email: string;
      password: string;
      tenantId?: number | null;
      tenant_id?: number | null;
      tenantSlug?: string | null;
      storeSubdomain?: string | null;
    }) => {
      const slug = String(
        credentials?.storeSubdomain || credentials?.tenantSlug || getActiveTenantSlug() || ''
      )
        .trim()
        .toLowerCase();
      const cleanSlug = slug && !RESERVED_SLUGS.has(slug) ? slug : null;
      const rawTid = Number(credentials?.tenantId ?? credentials?.tenant_id ?? 0);
      const cleanTenantId = Number.isInteger(rawTid) && rawTid > 0 ? rawTid : undefined;
      const qs = new URLSearchParams();
      if (cleanTenantId) qs.set('tenantId', String(cleanTenantId));
      if (cleanSlug) qs.set('storeSubdomain', cleanSlug);
      const queryStr = qs.toString() ? `?${qs.toString()}` : '';
      const endpoint = cleanSlug
        ? `/auth/store/${encodeURIComponent(cleanSlug)}/login${queryStr}`
        : `/auth/store/login${queryStr}`;
      return apiFetch(endpoint, {
        method: 'POST',
        body: {
          ...credentials,
          ...(cleanTenantId ? { tenantId: cleanTenantId, tenant_id: cleanTenantId } : {}),
          tenantSlug: cleanSlug,
          storeSubdomain: cleanSlug,
        },
        tenantSlug: cleanSlug,
      });
    },
    login: (credentials: any) => {
      const slug = String(
        credentials?.storeSubdomain || credentials?.tenantSlug || getActiveTenantSlug() || ''
      )
        .trim()
        .toLowerCase();
      const cleanSlug = slug && !RESERVED_SLUGS.has(slug) ? slug : null;
      const rawTid = Number(credentials?.tenantId ?? credentials?.tenant_id ?? 0);
      const cleanTenantId = Number.isInteger(rawTid) && rawTid > 0 ? rawTid : undefined;
      const qs = new URLSearchParams();
      if (cleanTenantId) qs.set('tenantId', String(cleanTenantId));
      if (cleanSlug) qs.set('storeSubdomain', cleanSlug);
      const queryStr = qs.toString() ? `?${qs.toString()}` : '';
      if (cleanSlug) {
        return apiFetch(`/auth/store/${encodeURIComponent(cleanSlug)}/login${queryStr}`, {
          method: 'POST',
          body: {
            ...credentials,
            ...(cleanTenantId ? { tenantId: cleanTenantId, tenant_id: cleanTenantId } : {}),
            tenantSlug: cleanSlug,
            storeSubdomain: cleanSlug,
          },
          tenantSlug: cleanSlug,
        });
      }
      return apiFetch(`/auth/login${queryStr}`, {
        method: 'POST',
        body: {
          ...credentials,
          ...(cleanTenantId ? { tenantId: cleanTenantId, tenant_id: cleanTenantId } : {}),
        },
        tenantSlug: credentials?.tenantSlug ?? null,
      });
    },
    getStoreCredentials: (slug?: string, tenantId?: number) => {
      const qs = new URLSearchParams();
      if (slug) qs.set('slug', slug);
      if (tenantId && tenantId > 0) qs.set('tenantId', String(tenantId));
      const queryStr = qs.toString() ? `?${qs.toString()}` : '';
      return apiFetch<any>(`/auth/store-credentials${queryStr}`, {
        tenantSlug: slug || undefined,
      });
    },
    signup: (data: any) => apiFetch('/auth/signup', { method: 'POST', body: data }),
    forgotPassword: (data: { email: string; tenantSlug?: string | null; tenantId?: number | null }) => {
      const cleanSlug = data?.tenantSlug || getActiveTenantSlug();
      const rawTid = Number(data?.tenantId ?? 0);
      const cleanTenantId = Number.isInteger(rawTid) && rawTid > 0 ? rawTid : undefined;
      const queryStr = cleanTenantId ? `?tenantId=${cleanTenantId}` : '';
      return apiFetch(`/auth/forgot-password${queryStr}`, {
        method: 'POST',
        body: {
          ...data,
          ...(cleanTenantId ? { tenantId: cleanTenantId, tenant_id: cleanTenantId } : {}),
          tenantSlug: cleanSlug,
          storeSubdomain: cleanSlug,
        },
        tenantSlug: cleanSlug,
      });
    },
    resetPassword: (data: {
      email: string;
      token: string;
      newPassword: string;
      tenantSlug?: string | null;
      tenantId?: number | null;
    }) => {
      const cleanSlug = data?.tenantSlug || getActiveTenantSlug();
      const rawTid = Number(data?.tenantId ?? 0);
      const cleanTenantId = Number.isInteger(rawTid) && rawTid > 0 ? rawTid : undefined;
      const queryStr = cleanTenantId ? `?tenantId=${cleanTenantId}` : '';
      return apiFetch(`/auth/reset-password${queryStr}`, {
        method: 'POST',
        body: {
          ...data,
          ...(cleanTenantId ? { tenantId: cleanTenantId, tenant_id: cleanTenantId } : {}),
          tenantSlug: cleanSlug,
          storeSubdomain: cleanSlug,
        },
        tenantSlug: cleanSlug,
      });
    },
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
    list: async (params?: { search?: string; category?: string; brand?: string; lowStock?: boolean; lowStockOnly?: boolean; limit?: number }) => {
      const activeSlug = getActiveTenantSlug();
      const qs = new URLSearchParams();
      if (params?.search) qs.set('search', params.search);
      if (params?.category) qs.set('category', params.category);
      if (params?.brand) qs.set('brand', params.brand);
      if (params?.lowStock || params?.lowStockOnly) qs.set('lowStockOnly', 'true');
      if (params?.limit) qs.set('limit', String(params.limit));
      const query = qs.toString() ? `?${qs.toString()}` : '';

      const fallbackFromOfflineCache = async () => {
        let cached = await searchCachedProductsOffline(
          params?.search || '',
          activeSlug,
          params?.limit || 500
        );
        if (params?.brand) {
          const b = params.brand.toLowerCase().trim();
          cached = cached.filter(
            (p: any) => String(p.brandName || p.brand_name || p.brand || '').toLowerCase() === b
          );
        }
        if (params?.category) {
          const c = params.category.toLowerCase().trim();
          cached = cached.filter(
            (p: any) => String(p.categoryName || p.category_name || p.category || '').toLowerCase() === c
          );
        }
        if (params?.lowStock || params?.lowStockOnly) {
          cached = cached.filter(
            (p: any) => (Number(p.totalStock ?? p.total_stock ?? 0) || 0) <= (Number(p.lowStockLimit ?? 5) || 5)
          );
        }
        return { products: cached, offline: true };
      };

      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        return fallbackFromOfflineCache();
      }

      try {
        const res = await apiFetch<any>(`/products${query}`);
        if (res && Array.isArray(res.products) && res.products.length > 0) {
          cacheCatalogOffline(res.products, activeSlug).catch(() => {});
        }
        return res;
      } catch (err: any) {
        const msg = String(err?.message || '');
        if (
          (typeof navigator !== 'undefined' && navigator.onLine === false) ||
          msg.includes('Failed to fetch') ||
          msg.includes('temporarily reconnecting') ||
          msg.includes('Network')
        ) {
          return fallbackFromOfflineCache();
        }
        throw err;
      }
    },
    scanBarcode: async (code: string) => {
      const activeSlug = getActiveTenantSlug();
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        const cached = await lookupCachedProductOffline(code, activeSlug);
        if (cached) return { product: cached, offline: true };
      }
      try {
        const res = await apiFetch<any>(`/products/barcode/${encodeURIComponent(code)}`);
        if (res && res.product) {
          cacheCatalogOffline([res.product], activeSlug).catch(() => {});
        }
        return res;
      } catch (err: any) {
        const cached = await lookupCachedProductOffline(code, activeSlug).catch(() => null);
        if (cached) return { product: cached, offline: true };
        throw err;
      }
    },
    lookupBarcode: async (code: string) => {
      const activeSlug = getActiveTenantSlug();
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        const cached = await lookupCachedProductOffline(code, activeSlug);
        if (cached) return { product: cached, offline: true };
      }
      try {
        const res = await apiFetch<any>(`/products/barcode/${encodeURIComponent(code)}`);
        if (res && res.product) {
          cacheCatalogOffline([res.product], activeSlug).catch(() => {});
        }
        return res;
      } catch (err: any) {
        const cached = await lookupCachedProductOffline(code, activeSlug).catch(() => null);
        if (cached) return { product: cached, offline: true };
        throw err;
      }
    },
    getByBarcode: async (code: string) => {
      const activeSlug = getActiveTenantSlug();
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        const cached = await lookupCachedProductOffline(code, activeSlug);
        if (cached) return { product: cached, offline: true };
      }
      try {
        const res = await apiFetch<any>(`/products/barcode/${encodeURIComponent(code)}`);
        if (res && res.product) {
          cacheCatalogOffline([res.product], activeSlug).catch(() => {});
        }
        return res;
      } catch (err: any) {
        const cached = await lookupCachedProductOffline(code, activeSlug).catch(() => null);
        if (cached) return { product: cached, offline: true };
        throw err;
      }
    },
    getNextId: () => apiFetch('/products/next-id'),
    generateBarcode: (
      data?: number | string | { productId?: number | string; category?: string },
      categoryHint?: string
    ) => {
      const productId =
        typeof data === 'number' || typeof data === 'string'
          ? data
          : data?.productId;
      const category =
        typeof data === 'object' && data !== null ? data.category || categoryHint : categoryHint;
      const params = new URLSearchParams();
      if (productId !== undefined && productId !== null && productId !== '') {
        params.set('productId', String(productId));
      }
      if (category && category.trim()) {
        params.set('category', category.trim());
      }
      const qs = params.toString() ? `?${params.toString()}` : '';
      return apiFetch(`/products/generate-barcode${qs}`);
    },
    validateBarcode: (barcode: string, excludeId?: number) => {
      const qs = new URLSearchParams({ barcode: String(barcode || '') });
      if (excludeId !== undefined && excludeId !== null) {
        qs.set('excludeId', String(excludeId));
      }
      return apiFetch(`/products/validate-barcode?${qs.toString()}`);
    },
    validateArticle: (article: string, sku?: string, excludeId?: number) => {
      const qs = new URLSearchParams({ article: String(article || '') });
      if (sku) {
        qs.set('sku', String(sku));
      }
      if (excludeId !== undefined && excludeId !== null) {
        qs.set('excludeId', String(excludeId));
      }
      return apiFetch(`/products/validate-article?${qs.toString()}`);
    },
    getById: (id: number) => apiFetch(`/products/${id}`),
    get: (id: number) => apiFetch(`/products/${id}`),
    create: async (data: any) => {
      const res = await apiFetch<any>('/products', { method: 'POST', body: data });
      if (res && res.product) {
        cacheCatalogOffline([res.product], getActiveTenantSlug()).catch(() => {});
      }
      return res;
    },
    bulkImport: async (payload: any) => {
      const res = await apiFetch<any>('/products/bulk-import', {
        method: 'POST',
        body: Array.isArray(payload) ? { products: payload } : payload,
      });
      if (res && Array.isArray(res.products) && res.products.length > 0) {
        cacheCatalogOffline(res.products, getActiveTenantSlug()).catch(() => {});
      }
      return res;
    },
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
    update: async (id: number, data: any) => {
      const res = await apiFetch<any>(`/products/${id}`, { method: 'PUT', body: data });
      if (res && res.product) {
        cacheCatalogOffline([res.product], getActiveTenantSlug()).catch(() => {});
      }
      return res;
    },
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
