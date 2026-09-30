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

const ROOT_DOMAINS = new Set([
  'mypos.com',
  'www.mypos.com',
  'localhost',
  '127.0.0.1',
  '0.0.0.0',
]);

/**
 * Extracts subdomain slug from Host header, X-Tenant-Slug header, or URL path `/app/:slug`
 */
export function parseTenantSlugFromRequest(req: Request): {
  host: string;
  subdomain: string | null;
  pathSlug: string | null;
  queryDomain: string | null;
  isSuperAdminRoute: boolean;
} {
  const rawHost = String(
    req.headers['x-forwarded-host'] || req.headers.host || 'mypos.com'
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

  // Check explicit header X-Tenant-Slug
  const headerSlug = req.headers['x-tenant-slug'];
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
    if (cleanSlug !== 'root' && cleanSlug !== 'landing') {
      return {
        host: effectiveHost,
        subdomain: cleanSlug,
        pathSlug: null,
        queryDomain,
        isSuperAdminRoute: false,
      };
    }
  }

  // Check if effectiveHost is a Cloud Run preview URL (*.run.app) or root domain
  if (
    effectiveHost.endsWith('.run.app') ||
    ROOT_DOMAINS.has(effectiveHost)
  ) {
    return {
      host: effectiveHost,
      subdomain: null,
      pathSlug: null,
      queryDomain,
      isSuperAdminRoute: false,
    };
  }

  // Parse subdomain from e.g. mystore.mypos.com or mystore.localhost
  if (effectiveHost.endsWith('.mypos.com')) {
    const sub = effectiveHost.slice(0, -'.mypos.com'.length);
    if (sub && sub !== 'www') {
      if (sub === 'admin') {
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
        subdomain: sub,
        pathSlug: null,
        queryDomain,
        isSuperAdminRoute: false,
      };
    }
  }

  if (effectiveHost.endsWith('.localhost')) {
    const sub = effectiveHost.slice(0, -'.localhost'.length);
    if (sub && sub !== 'www') {
      return {
        host: effectiveHost,
        subdomain: sub,
        pathSlug: null,
        queryDomain,
        isSuperAdminRoute: false,
      };
    }
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
    is_onboarded: boolean;
  }>(
    `SELECT id, slug, name, status, app_key, subscription_plan, subscription_start_date, subscription_end_date, subscription_status, theme_color, background_color, logo_url, address, tax_id, currency, onboarding_completed, is_onboarded
     FROM tenants
     WHERE LOWER(slug) = LOWER($1)
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
    onboardingCompleted: Boolean(row.onboarding_completed || row.is_onboarded),
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
