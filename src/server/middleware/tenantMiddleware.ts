import type { Request, Response, NextFunction } from 'express';
import { pgClient } from '../../db/index.ts';
import {
  ensureSaasControlPlane,
  generateUniqueAppKey,
  normalizeSubscriptionPlan,
  calculateSubscriptionEndDate,
} from '../../db/schemaInit.ts';

export interface TenantRouteResolution {
  mode: 'LANDING' | 'SUPERADMIN' | 'TENANT_ACTIVE' | 'TENANT_SUSPENDED' | 'TENANT_EXPIRED' | 'TENANT_NOT_FOUND';
  host: string;
  subdomain: string | null;
  requestedSlug: string | null;
  rewrittenPath: string;
  tenant: {
    id: number;
    slug: string;
    name: string;
    status: 'ACTIVE' | 'SUSPENDED' | 'EXPIRED';
    appKey: string;
    subscriptionPlan: '6_MONTHS' | 'YEARLY' | string;
    subscriptionStartDate: string;
    subscriptionEndDate: string;
    subscriptionStatus: 'ACTIVE' | 'EXPIRED' | 'SUSPENDED';
    themeColor: string;
    backgroundColor: string;
    logoUrl: string;
    address: string;
    taxId: string;
    currency: string;
    onboardingCompleted: boolean;
  } | null;
}

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '0.0.0.0', '[::1]']);

const PLATFORM_PREVIEW_SUFFIXES = [
  '.run.app',
  '.googleusercontent.com',
  '.vercel.app',
  '.netlify.app',
  '.onrender.com',
  '.railway.app',
];

const RESERVED_SLUGS = new Set(['www', 'admin', 'superadmin', 'landing', 'root', 'default', 'api']);

function isPlatformPreviewHost(host: string): boolean {
  return PLATFORM_PREVIEW_SUFFIXES.some((suffix) => host.endsWith(suffix));
}

function isIpAddress(host: string): boolean {
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(':');
}

/**
 * Extracts a store subdomain from any custom domain hostname
 * (e.g. store1.example.com -> store1, store1.pos.co.uk -> store1, store1.localhost -> store1)
 */
export function extractSubdomainFromHostname(rawHostname: string): string | null {
  const host = String(rawHostname || '')
    .split(',')[0]
    .trim()
    .toLowerCase()
    .replace(/:\d+$/, '');

  if (!host || LOCAL_HOSTS.has(host) || isIpAddress(host) || isPlatformPreviewHost(host)) {
    return null;
  }

  const configuredRoot = String(process.env.ROOT_DOMAIN || process.env.APP_DOMAIN || '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/:\d+$/, '')
    .replace(/^www\./, '');

  if (configuredRoot && (host === configuredRoot || host === `www.${configuredRoot}`)) {
    return null;
  }

  if (configuredRoot && host.endsWith(`.${configuredRoot}`)) {
    const sub = host.slice(0, -`.${configuredRoot}`.length).trim();
    if (sub && !sub.includes('.') && !RESERVED_SLUGS.has(sub)) {
      return sub;
    }
    return null;
  }

  if (host.endsWith('.localhost')) {
    const sub = host.slice(0, -'.localhost'.length).trim();
    if (sub && !RESERVED_SLUGS.has(sub)) {
      return sub;
    }
    return null;
  }

  const parts = host.split('.').filter(Boolean);
  // Standard custom domain with subdomain: e.g. store1.customdomain.com (3+ parts)
  if (parts.length >= 3) {
    // Handle 2-level country TLDs like .co.uk, .com.pk, .org.uk, .net.pk where root has 3 parts and subdomain has 4+ parts
    const secondLast = parts[parts.length - 2];
    const isMultiPartTld =
      parts.length === 3 && ['co', 'com', 'org', 'net', 'gov', 'edu'].includes(secondLast) && parts[parts.length - 1].length === 2;
    if (!isMultiPartTld) {
      const sub = parts[0];
      if (sub && !RESERVED_SLUGS.has(sub)) {
        return sub;
      }
    }
  }

  return null;
}

/**
 * Extracts and cross-validates the specific store subdomain from Origin, Referer, Host, route params, and headers.
 * Prevents cross-origin login spoofing if a request from Store 1 attempts to authenticate or act as Store 2.
 */
export function extractRequestStoreSubdomain(req: Request): {
  originSubdomain: string | null;
  claimedSlug: string | null;
  effectiveSlug: string | null;
  isSpoofed: boolean;
} {
  let originSubdomain: string | null = null;

  // 1. Check Origin header hostname
  const originHeader = req.headers.origin;
  if (typeof originHeader === 'string' && originHeader.trim() && originHeader !== 'null') {
    try {
      const originUrl = new URL(originHeader);
      originSubdomain = extractSubdomainFromHostname(originUrl.hostname);
    } catch {}
  }

  // 2. Check Referer header (hostname subdomain, /app/:slug path, or ?domain= query)
  const refererHeader = req.headers.referer || req.headers.referrer;
  if (!originSubdomain && typeof refererHeader === 'string' && refererHeader.trim()) {
    try {
      const refUrl = new URL(refererHeader);
      const fromRefHost = extractSubdomainFromHostname(refUrl.hostname);
      const fromRefPath = refUrl.pathname.match(/^\/app\/([a-z0-9-]+)(?:\/|$)/i)?.[1]?.toLowerCase() || null;
      const refDomainParam = refUrl.searchParams.get('domain');
      const fromRefDomain = refDomainParam
        ? extractSubdomainFromHostname(refDomainParam) || refDomainParam.split('.')[0].toLowerCase()
        : null;
      const candidate = fromRefHost || fromRefPath || fromRefDomain;
      if (candidate && !RESERVED_SLUGS.has(candidate)) {
        originSubdomain = candidate;
      }
    } catch {}
  }

  // 3. Check Host / X-Forwarded-Host / X-Simulated-Host
  if (!originSubdomain) {
    const rawHost = String(
      req.headers['x-simulated-host'] || req.headers['x-forwarded-host'] || req.headers.host || ''
    );
    const fromHost = extractSubdomainFromHostname(rawHost);
    if (fromHost) {
      originSubdomain = fromHost;
    }
  }

  // 4. Extract explicitly claimed store slug from route params, headers, query, or body
  const fullPath = String(req.originalUrl || req.path || '');
  const storeAuthRouteMatch = fullPath.match(/\/api\/auth\/store\/([a-z0-9-]+)(?:\/|\?|$)/i);
  const appPathMatch = fullPath.match(/^\/app\/([a-z0-9-]+)(?:\/|\?|$)/i);
  const paramSlug =
    (typeof (req.params as any)?.slug === 'string' ? (req.params as any).slug : '') ||
    storeAuthRouteMatch?.[1] ||
    appPathMatch?.[1] ||
    '';

  const headerStoreSub = String(req.headers['x-store-subdomain'] || '').trim().toLowerCase();
  const headerTenantSlug = String(req.headers['x-tenant-slug'] || '').trim().toLowerCase();
  const bodySlug = String(req.body?.tenantSlug || req.body?.slug || '').trim().toLowerCase();
  const querySlug = String(req.query?.slug || req.query?.tenantSlug || '').trim().toLowerCase();

  const rawClaimed = [paramSlug.toLowerCase(), headerStoreSub, headerTenantSlug, bodySlug, querySlug].find(
    (s) => s && !RESERVED_SLUGS.has(s)
  ) || null;

  // Check if two explicit claims within the request conflict with each other (e.g. route param vs header/body)
  const distinctClaims = new Set(
    [paramSlug.toLowerCase(), headerStoreSub, headerTenantSlug, bodySlug].filter(
      (s) => s && !RESERVED_SLUGS.has(s)
    )
  );

  const isSpoofed =
    distinctClaims.size > 1 ||
    Boolean(originSubdomain && rawClaimed && originSubdomain !== rawClaimed);

  const effectiveSlug = originSubdomain || rawClaimed || null;

  return {
    originSubdomain,
    claimedSlug: rawClaimed,
    effectiveSlug,
    isSpoofed,
  };
}

/**
 * Extracts subdomain slug from Host header, X-Store-Subdomain / X-Tenant-Slug header, Origin/Referer, or URL path `/app/:slug`
 */
export function parseTenantSlugFromRequest(req: Request): {
  host: string;
  subdomain: string | null;
  pathSlug: string | null;
  queryDomain: string | null;
  isSuperAdminRoute: boolean;
} {
  const rawHost = String(
    req.headers['x-forwarded-host'] || req.headers.host || 'localhost'
  )
    .split(',')[0]
    .trim()
    .toLowerCase()
    .replace(/:\d+$/, '');

  const queryDomain =
    typeof req.query.domain === 'string'
      ? req.query.domain.trim().toLowerCase()
      : typeof req.headers['x-simulated-host'] === 'string'
      ? String(req.headers['x-simulated-host']).trim().toLowerCase()
      : null;

  const effectiveHost = (queryDomain || rawHost).replace(/:\d+$/, '');
  const pathname = req.path || '/';

  // Check if path is /admin or /admin/*
  if (pathname === '/admin' || pathname.startsWith('/admin/')) {
    return {
      host: effectiveHost,
      subdomain: null,
      pathSlug: null,
      queryDomain,
      isSuperAdminRoute: true,
    };
  }

  // Check if path is /app/:slug or /app/:slug/*
  const appMatch = pathname.match(/^\/app\/([a-z0-9-]+)(?:\/|$)/i);
  if (appMatch) {
    return {
      host: effectiveHost,
      subdomain: appMatch[1].toLowerCase(),
      pathSlug: appMatch[1].toLowerCase(),
      queryDomain,
      isSuperAdminRoute: false,
    };
  }

  // Check explicit header X-Store-Subdomain or X-Tenant-Slug
  const headerSlug = req.headers['x-store-subdomain'] || req.headers['x-tenant-slug'];
  if (typeof headerSlug === 'string' && headerSlug.trim()) {
    const cleanSlug = headerSlug.trim().toLowerCase();
    if (cleanSlug === 'admin') {
      return {
        host: effectiveHost,
        subdomain: null,
        pathSlug: null,
        queryDomain,
        isSuperAdminRoute: true,
      };
    }
    if (!RESERVED_SLUGS.has(cleanSlug)) {
      return {
        host: effectiveHost,
        subdomain: cleanSlug,
        pathSlug: null,
        queryDomain,
        isSuperAdminRoute: false,
      };
    }
  }

  // Check Origin / Referer store subdomain
  const subCheck = extractRequestStoreSubdomain(req);
  if (subCheck.originSubdomain) {
    return {
      host: effectiveHost,
      subdomain: subCheck.originSubdomain,
      pathSlug: null,
      queryDomain,
      isSuperAdminRoute: false,
    };
  }

  // Check if effectiveHost is a platform preview URL or local root domain
  if (isPlatformPreviewHost(effectiveHost) || LOCAL_HOSTS.has(effectiveHost) || isIpAddress(effectiveHost)) {
    return {
      host: effectiveHost,
      subdomain: null,
      pathSlug: null,
      queryDomain,
      isSuperAdminRoute: false,
    };
  }

  // Parse subdomain from any custom domain (e.g. mystore.yourdomain.com or mystore.localhost)
  const extractedSub = extractSubdomainFromHostname(effectiveHost);
  if (extractedSub) {
    return {
      host: effectiveHost,
      subdomain: extractedSub,
      pathSlug: null,
      queryDomain,
      isSuperAdminRoute: false,
    };
  }

  // Also check if admin.<customdomain> was requested
  const parts = effectiveHost.split('.').filter(Boolean);
  if (parts.length >= 2 && parts[0] === 'admin') {
    return {
      host: effectiveHost,
      subdomain: null,
      pathSlug: null,
      queryDomain,
      isSuperAdminRoute: true,
    };
  }

  return {
    host: effectiveHost,
    subdomain: null,
    pathSlug: null,
    queryDomain,
    isSuperAdminRoute: false,
  };
}

/**
 * Resolves the tenant context for any incoming request
 */
export async function resolveTenantContext(req: Request): Promise<TenantRouteResolution> {
  await ensureSaasControlPlane();
  const parsed = parseTenantSlugFromRequest(req);

  if (parsed.isSuperAdminRoute) {
    return {
      mode: 'SUPERADMIN',
      host: parsed.host,
      subdomain: null,
      requestedSlug: null,
      rewrittenPath: '/admin',
      tenant: null,
    };
  }

  const slug = parsed.subdomain || parsed.pathSlug;
  if (!slug) {
    return {
      mode: 'LANDING',
      host: parsed.host,
      subdomain: null,
      requestedSlug: null,
      rewrittenPath: '/',
      tenant: null,
    };
  }

  const tenantRes = await pgClient.query<{
    id: number;
    slug: string;
    name: string;
    status: 'ACTIVE' | 'SUSPENDED' | 'EXPIRED';
    app_key: string;
    subscription_plan: string;
    subscription_start_date: string;
    subscription_end_date: string;
    subscription_status: 'ACTIVE' | 'EXPIRED' | 'SUSPENDED';
    theme_color: string;
    background_color: string;
    logo_url: string;
    address: string;
    tax_id: string;
    currency: string;
    onboarding_completed: boolean;
  }>(
    `SELECT t.id, t.slug, t.name, t.status, t.app_key, t.subscription_plan,
            t.subscription_start_date, t.subscription_end_date, t.subscription_status,
            t.theme_color, t.background_color, t.onboarding_completed,
            COALESCE(NULLIF(cs.logo, ''), '/pwa-512x512.png') AS logo_url,
            COALESCE(cs.address, '') AS address,
            COALESCE(cs.tax_id, '') AS tax_id,
            COALESCE(cs.currency, 'PKR') AS currency
     FROM tenants t
     LEFT JOIN company_settings cs ON cs.tenant_id = t.id
     WHERE LOWER(t.slug) = LOWER($1)
     LIMIT 1`,
    [slug]
  );

  if (tenantRes.rows.length === 0) {
    return {
      mode: 'TENANT_NOT_FOUND',
      host: parsed.host,
      subdomain: slug,
      requestedSlug: slug,
      rewrittenPath: `/404-tenant?slug=${encodeURIComponent(slug)}`,
      tenant: null,
    };
  }

  const row = tenantRes.rows[0];
  let effectiveAppKey = row.app_key && String(row.app_key).trim() ? String(row.app_key).trim() : '';
  const effectivePlan = normalizeSubscriptionPlan(
    row.subscription_plan || (row.slug === 'mystore' || row.slug === 'apex-boots' ? '6_MONTHS' : 'YEARLY')
  );
  const effectiveStartDt = row.subscription_start_date ? new Date(row.subscription_start_date) : new Date();
  const effectiveEndDt = row.subscription_end_date
    ? new Date(row.subscription_end_date)
    : calculateSubscriptionEndDate(effectivePlan, effectiveStartDt);

  let effectiveSubscriptionStatus: 'ACTIVE' | 'EXPIRED' | 'SUSPENDED' =
    (String(row.subscription_status || 'ACTIVE').toUpperCase() as 'ACTIVE' | 'EXPIRED' | 'SUSPENDED');

  // Automatic Expiry Tracking: Check if subscriptionEndDate < currentTimestamp
  if (effectiveEndDt.getTime() < Date.now()) {
    effectiveSubscriptionStatus = 'EXPIRED';
  } else if (row.status === 'SUSPENDED') {
    effectiveSubscriptionStatus = 'SUSPENDED';
  }

  if (!effectiveAppKey || !row.subscription_start_date || !row.subscription_end_date || String(row.subscription_status).toUpperCase() !== effectiveSubscriptionStatus) {
    if (!effectiveAppKey) {
      effectiveAppKey = await generateUniqueAppKey();
    }
    await pgClient
      .query(
        `UPDATE tenants
         SET app_key = $1,
             subscription_plan = $2,
             subscription_start_date = $3,
             subscription_end_date = $4,
             subscription_status = $5,
             updated_at = NOW()
         WHERE id = $6`,
        [
          effectiveAppKey,
          effectivePlan,
          effectiveStartDt.toISOString(),
          effectiveEndDt.toISOString(),
          effectiveSubscriptionStatus,
          row.id,
        ]
      )
      .catch(() => {});
  }

  const tenant = {
    id: row.id,
    slug: row.slug,
    name: row.name,
    status: row.status,
    appKey: effectiveAppKey,
    subscriptionPlan: effectivePlan,
    subscriptionStartDate: effectiveStartDt.toISOString(),
    subscriptionEndDate: effectiveEndDt.toISOString(),
    subscriptionStatus: effectiveSubscriptionStatus,
    themeColor: row.theme_color || '#7C3AED',
    backgroundColor: row.background_color || '#0F172A',
    logoUrl: row.logo_url || '/pwa-512x512.png',
    address: row.address || '',
    taxId: row.tax_id || '',
    currency: row.currency || 'PKR',
    onboardingCompleted: Boolean(row.onboarding_completed),
  };

  if (row.status === 'SUSPENDED' || effectiveSubscriptionStatus === 'SUSPENDED') {
    return {
      mode: 'TENANT_SUSPENDED',
      host: parsed.host,
      subdomain: row.slug,
      requestedSlug: row.slug,
      rewrittenPath: `/app/${row.slug}/suspended`,
      tenant,
    };
  }

  if (effectiveSubscriptionStatus === 'EXPIRED' || row.status === 'EXPIRED') {
    return {
      mode: 'TENANT_EXPIRED',
      host: parsed.host,
      subdomain: row.slug,
      requestedSlug: row.slug,
      rewrittenPath: `/app/${row.slug}/expired`,
      tenant,
    };
  }

  return {
    mode: 'TENANT_ACTIVE',
    host: parsed.host,
    subdomain: row.slug,
    requestedSlug: row.slug,
    rewrittenPath: `/app/${row.slug}`,
    tenant,
  };
}

/**
 * Express Subdomain & Multi-Tenant Routing Middleware
 * Attaches resolved tenant metadata to `req` and enforces real-time suspension and subscription expiry checks on API calls.
 */
export async function tenantRoutingMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    // Skip static assets
    if (
      req.path.startsWith('/assets/') ||
      req.path.startsWith('/node_modules/') ||
      req.path.startsWith('/src/') ||
      req.path.startsWith('/@') ||
      req.path.endsWith('.png') ||
      req.path.endsWith('.svg') ||
      req.path.endsWith('.ico') ||
      req.path.endsWith('.jpg')
    ) {
      return next();
    }

    const resolution = await resolveTenantContext(req);
    (req as any).tenantResolution = resolution;

    // Set informational headers for debugging and PWA scope inspection
    res.setHeader('X-SaaS-Mode', resolution.mode);
    if (resolution.tenant) {
      res.setHeader('X-Tenant-Id', String(resolution.tenant.id));
      res.setHeader('X-Tenant-Slug', resolution.tenant.slug);
      res.setHeader('X-Tenant-Status', resolution.tenant.status);
      res.setHeader('X-Subscription-Status', resolution.tenant.subscriptionStatus);
    }

    // Real-time middleware enforcement: block API calls to expired or suspended tenants (except superadmin, auth & saas resolution)
    if (
      req.path.startsWith('/api/') &&
      !req.path.startsWith('/api/superadmin') &&
      !req.path.startsWith('/api/saas') &&
      !req.path.startsWith('/api/tenants/') &&
      !req.path.startsWith('/api/auth')
    ) {
      if (resolution.mode === 'TENANT_EXPIRED' || resolution.tenant?.subscriptionStatus === 'EXPIRED') {
        return res.status(403).json({
          error: 'Your subscription key has expired. Please contact support to renew.',
          code: 'SUBSCRIPTION_EXPIRED',
          tenant: resolution.tenant,
        });
      }
      if (resolution.mode === 'TENANT_SUSPENDED') {
        return res.status(423).json({
          error: `Store "${resolution.tenant?.name || resolution.requestedSlug}" is currently suspended. Please contact platform billing or support.`,
          code: 'TENANT_SUSPENDED',
          tenant: resolution.tenant,
        });
      }
    }

    next();
  } catch (err) {
    next();
  }
}
