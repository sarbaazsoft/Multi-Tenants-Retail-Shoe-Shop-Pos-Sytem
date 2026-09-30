import { Router } from 'express';
import type { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { pgClient } from '../../db/index.ts';
import {
  ensureSaasControlPlane,
  ensureTenantStoreUsers,
  generateUniqueAppKey,
  normalizeSubscriptionPlan,
  calculateSubscriptionEndDate,
  syncExpiredTenantSubscriptions,
} from '../../db/schemaInit.ts';
import { requireAuth, requireSuperAdmin, generateToken, type AuthenticatedRequest } from '../auth.ts';
import { resolveTenantContext } from '../middleware/tenantMiddleware.ts';

const router = Router();

/**
 * 1. DYNAMIC STORE PWA MANIFEST (`/api/tenants/:slug/manifest`)
 * Generates dynamic `manifest.webmanifest` for each active store (e.g., `mystore.mypos.com`).
 * Dynamic Fields: `name`, `short_name`, `theme_color`, `background_color`, `icons` (Tenant Logo URL).
 * Scope Isolation: Sets `start_url` to `/app/[tenant_slug]/login` and `scope` to `/app/[tenant_slug]/`
 * so each store installs as an independent PWA.
 */
router.get('/tenants/:slug/manifest', async (req: Request, res: Response) => {
  try {
    await ensureSaasControlPlane();
    const rawSlug = String(req.params.slug || '')
      .trim()
      .toLowerCase()
      .replace(/\.webmanifest$/, '');

    const tenantRes = await pgClient.query<{
      id: number;
      slug: string;
      name: string;
      status: string;
      theme_color: string;
      background_color: string;
      logo_url: string;
    }>(
      `SELECT id, slug, name, status, theme_color, background_color, logo_url
       FROM tenants
       WHERE LOWER(slug) = LOWER($1)
       LIMIT 1`,
      [rawSlug]
    );

    if (tenantRes.rows.length === 0) {
      return res.status(404).json({
        error: `Tenant manifest not found for store '${rawSlug}'.`,
      });
    }

    const tenant = tenantRes.rows[0];
    const logoUrl = tenant.logo_url && tenant.logo_url.trim() ? tenant.logo_url.trim() : '/pwa-512x512.png';
    const shortName = tenant.name.length > 14 ? tenant.name.slice(0, 14).trim() : tenant.name;

    const manifest = {
      id: `/app/${tenant.slug}/`,
      name: `${tenant.name} — POS Terminal`,
      short_name: shortName,
      description: `Dedicated Retail POS & Inventory Terminal for ${tenant.name} (${tenant.slug}.mypos.com)`,
      start_url: `/app/${tenant.slug}/login`,
      scope: `/app/${tenant.slug}/`,
      display: 'standalone',
      orientation: 'any',
      theme_color: tenant.theme_color || '#7C3AED',
      background_color: tenant.background_color || '#0F172A',
      categories: ['business', 'shopping', 'finance'],
      icons: [
        {
          src: logoUrl,
          sizes: '192x192',
          type: 'image/png',
          purpose: 'any',
        },
        {
          src: logoUrl,
          sizes: '512x512',
          type: 'image/png',
          purpose: 'any',
        },
        {
          src: '/pwa-maskable-512x512.png',
          sizes: '512x512',
          type: 'image/png',
          purpose: 'maskable',
        },
      ],
    };

    res.setHeader('Content-Type', 'application/manifest+json');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    return res.json(manifest);
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to generate dynamic tenant manifest: ' + err.message });
  }
});

/**
 * 2. RESOLVE CURRENT SAAS ROUTE & SUBDOMAIN STATUS (`/api/saas/resolve`)
 * Used by the SPA and Subdomain Router to inspect current host/subdomain/tenant status,
 * and returns the directory of deployed tenants for quick multi-tenant preview switching.
 */
router.get('/saas/resolve', async (req: Request, res: Response) => {
  try {
    await ensureSaasControlPlane();
    await syncExpiredTenantSubscriptions();
    const resolution = await resolveTenantContext(req);

    const directoryRes = await pgClient.query<{
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
      currency: string;
      onboarding_completed: boolean;
    }>(
      `SELECT id, slug, name, status, app_key, subscription_plan, subscription_start_date, subscription_end_date, subscription_status, theme_color, background_color, logo_url, currency, onboarding_completed
       FROM tenants
       ORDER BY id ASC`
    );

    return res.json({
      resolution,
      availableTenants: directoryRes.rows.map((t) => ({
        id: t.id,
        slug: t.slug,
        name: t.name,
        status: t.status,
        appKey: t.app_key || '',
        subscriptionPlan: t.subscription_plan || 'YEARLY',
        subscriptionStartDate: t.subscription_start_date ? new Date(t.subscription_start_date).toISOString() : '',
        subscriptionEndDate: t.subscription_end_date ? new Date(t.subscription_end_date).toISOString() : '',
        subscriptionStatus: (t.subscription_status || 'ACTIVE') as 'ACTIVE' | 'EXPIRED' | 'SUSPENDED',
        themeColor: t.theme_color,
        backgroundColor: t.background_color,
        logoUrl: t.logo_url,
        currency: t.currency,
        onboardingCompleted: Boolean(t.onboarding_completed),
        subdomainUrl: `${t.slug}.mypos.com`,
        appPath: `/app/${t.slug}`,
        manifestUrl: `/api/tenants/${t.slug}/manifest`,
      })),
    });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to resolve tenant context: ' + err.message });
  }
});

/**
 * 3. PUBLIC LANDING PAGE: SUBMIT STORE REQUEST / FREE TRIAL (`/api/saas/store-requests`)
 */
router.post('/saas/store-requests', async (req: Request, res: Response) => {
  try {
    await ensureSaasControlPlane();
    const { storeName, requestedSlug, ownerName, ownerEmail, ownerPhone, plan } = req.body || {};

    if (!storeName || !requestedSlug || !ownerName || !ownerEmail) {
      return res.status(400).json({
        error: 'Store name, subdomain slug, owner name, and email are required.',
      });
    }

    const cleanSlug = String(requestedSlug)
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');

    if (!cleanSlug || cleanSlug.length < 2) {
      return res.status(400).json({ error: 'Subdomain slug must be at least 2 valid characters.' });
    }

    const reservedSlugs = new Set(['admin', 'api', 'www', 'app', 'root', 'mail', 'support', 'billing']);
    if (reservedSlugs.has(cleanSlug)) {
      return res.status(400).json({ error: `The subdomain '${cleanSlug}' is reserved by the platform.` });
    }

    // Check if tenant slug already exists
    const existingTenant = await pgClient.query('SELECT id FROM tenants WHERE LOWER(slug) = $1', [cleanSlug]);
    if (existingTenant.rows.length > 0) {
      return res.status(409).json({
        error: `The subdomain '${cleanSlug}.mypos.com' is already taken by an active store.`,
      });
    }

    // If a new request is explicitly submitted for this slug, clear any prior deletion tombstone for this slug
    await pgClient
      .query('DELETE FROM deleted_store_requests WHERE LOWER(requested_slug) = LOWER($1)', [cleanSlug])
      .catch(() => {});

    const insertRes = await pgClient.query<{ id: number }>(
      `INSERT INTO store_requests (store_name, requested_slug, owner_name, owner_email, owner_phone, plan, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'PENDING')
       RETURNING id`,
      [
        String(storeName).trim(),
        cleanSlug,
        String(ownerName).trim(),
        String(ownerEmail).trim().toLowerCase(),
        String(ownerPhone || '').trim(),
        String(plan || 'PRO_TRIAL').trim(),
      ]
    );

    return res.status(201).json({
      success: true,
      requestId: insertRes.rows[0].id,
      requestedSlug: cleanSlug,
      message: `Store request for '${cleanSlug}.mypos.com' submitted! Our SuperAdmin team can now provision it with 1 click.`,
    });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to submit store request: ' + err.message });
  }
});

/**
 * 4. SUPERADMIN CONTROL PANEL: OVERVIEW METRICS, DEPLOYED STORES & PENDING REQUESTS QUEUE
 * Accessible strictly via JWT with `SUPERADMIN` role (`GET /api/superadmin/overview`)
 */
router.get('/superadmin/overview', requireAuth, requireSuperAdmin, async (_req: AuthenticatedRequest, res: Response) => {
  try {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    await ensureSaasControlPlane();
    await syncExpiredTenantSubscriptions();

    const storesRes = await pgClient.query<{
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
      owner_name: string;
      owner_email: string;
      owner_phone: string;
      address: string;
      tax_id: string;
      currency: string;
      onboarding_completed: boolean;
      created_at: string;
      product_count: string;
      total_stock_units: string;
      sales_count: string;
      total_sales_revenue: string;
      staff_count: string;
    }>(`
      SELECT 
        t.*,
        (SELECT COUNT(*) FROM products p WHERE p.tenant_id = t.id AND p.active = true)::text as product_count,
        (SELECT COALESCE(SUM(p.total_stock), 0) FROM products p WHERE p.tenant_id = t.id AND p.active = true)::text as total_stock_units,
        (SELECT COUNT(*) FROM sales s WHERE s.tenant_id = t.id)::text as sales_count,
        (SELECT COALESCE(SUM(s.total_amount), 0) FROM sales s WHERE s.tenant_id = t.id)::text as total_sales_revenue,
        (SELECT COUNT(*) FROM users u WHERE u.tenant_id = t.id AND u.role != 'SUPERADMIN')::text as staff_count
      FROM tenants t
      ORDER BY t.id ASC
    `);

    const requestsRes = await pgClient.query(`
      SELECT *
      FROM store_requests
      ORDER BY CASE WHEN status = 'PENDING' THEN 0 ELSE 1 END, id DESC
    `);

    const stores = storesRes.rows.map((s) => {
      const endDateIso = s.subscription_end_date ? new Date(s.subscription_end_date).toISOString() : '';
      const startDateIso = s.subscription_start_date ? new Date(s.subscription_start_date).toISOString() : '';
      const isDateExpired = endDateIso && new Date(endDateIso).getTime() < Date.now();
      let subStatus: 'ACTIVE' | 'EXPIRED' | 'SUSPENDED' = (String(s.subscription_status || 'ACTIVE').toUpperCase() as any);
      if (s.status === 'SUSPENDED') {
        subStatus = 'SUSPENDED';
      } else if (isDateExpired) {
        subStatus = 'EXPIRED';
      }

      return {
        id: s.id,
        slug: s.slug,
        subdomain: `${s.slug}.mypos.com`,
        name: s.name,
        status: s.status,
        appKey: s.app_key || '',
        subscriptionPlan: normalizeSubscriptionPlan(s.subscription_plan),
        subscriptionStartDate: startDateIso,
        subscriptionEndDate: endDateIso,
        subscriptionStatus: subStatus,
        themeColor: s.theme_color || '#7C3AED',
        backgroundColor: s.background_color || '#0F172A',
        logoUrl: s.logo_url || '/pwa-512x512.png',
        ownerName: s.owner_name || 'Store Admin',
        ownerEmail: s.owner_email || '',
        ownerPhone: s.owner_phone || '',
        address: s.address || '',
        taxId: s.tax_id || '',
        currency: s.currency || 'PKR',
        onboardingCompleted: Boolean(s.onboarding_completed),
        createdAt: s.created_at,
        productCount: parseInt(s.product_count || '0', 10),
        totalStockUnits: parseInt(s.total_stock_units || '0', 10),
        salesCount: parseInt(s.sales_count || '0', 10),
        totalSales: parseFloat(s.total_sales_revenue || '0'),
        staffCount: parseInt(s.staff_count || '0', 10),
        manifestUrl: `/api/tenants/${s.slug}/manifest`,
        appUrl: `/app/${s.slug}`,
        installUrl: `/app/${s.slug}/install`,
      };
    });

    const totalPlatformRevenue = stores.reduce((sum, st) => sum + st.totalSales, 0);
    const totalPlatformProducts = stores.reduce((sum, st) => sum + st.productCount, 0);
    const activeStoresCount = stores.filter((st) => st.status === 'ACTIVE' && st.subscriptionStatus === 'ACTIVE').length;
    const suspendedStoresCount = stores.filter((st) => st.status === 'SUSPENDED' || st.subscriptionStatus === 'SUSPENDED').length;
    const expiredStoresCount = stores.filter((st) => st.subscriptionStatus === 'EXPIRED').length;

    return res.json({
      metrics: {
        totalStores: stores.length,
        activeStores: activeStoresCount,
        suspendedStores: suspendedStoresCount,
        expiredStores: expiredStoresCount,
        pendingRequests: requestsRes.rows.filter((r: any) => r.status === 'PENDING').length,
        totalPlatformRevenue,
        totalPlatformProducts,
      },
      stores,
      storeRequests: requestsRes.rows,
    });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to load SuperAdmin overview: ' + err.message });
  }
});

/**
 * 5. SUPERADMIN REAL-TIME TENANT ACTIVE / DISABLE TOGGLE (`PATCH /api/superadmin/tenants/:id/status`)
 * Immediately revokes or restores tenant access at both API and subdomain middleware levels.
 */
router.patch('/superadmin/tenants/:id/status', requireAuth, requireSuperAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = parseInt(req.params.id, 10);
    const { status } = req.body || {};

    if (!['ACTIVE', 'SUSPENDED', 'EXPIRED'].includes(status)) {
      return res.status(400).json({ error: 'Status must be ACTIVE, EXPIRED, or SUSPENDED.' });
    }

    const currRes = await pgClient.query<{
      id: number;
      subscription_plan: string;
      subscription_end_date: string | null;
    }>('SELECT id, subscription_plan, subscription_end_date FROM tenants WHERE id = $1 LIMIT 1', [tenantId]);

    if (currRes.rows.length === 0) {
      return res.status(404).json({ error: 'Store tenant not found.' });
    }

    const curr = currRes.rows[0];
    let nextTenantStatus = status === 'EXPIRED' ? 'ACTIVE' : status;
    let nextSubStatus = status;
    let nextEndDate = curr.subscription_end_date ? new Date(curr.subscription_end_date) : calculateSubscriptionEndDate(curr.subscription_plan || 'YEARLY');

    // If activating an expired store via status toggle, automatically renew its expiry from today based on its plan
    if (status === 'ACTIVE' && nextEndDate.getTime() < Date.now()) {
      nextEndDate = calculateSubscriptionEndDate(curr.subscription_plan || 'YEARLY', new Date());
    }

    const updateRes = await pgClient.query<{
      id: number;
      slug: string;
      name: string;
      status: string;
      subscription_status: string;
      subscription_end_date: string;
    }>(
      `UPDATE tenants
       SET status = $1,
           subscription_status = $2,
           subscription_end_date = $3,
           updated_at = NOW()
       WHERE id = $4
       RETURNING id, slug, name, status, subscription_status, subscription_end_date`,
      [nextTenantStatus, nextSubStatus, nextEndDate.toISOString(), tenantId]
    );

    const updated = updateRes.rows[0];
    return res.json({
      success: true,
      tenant: updated,
      message:
        updated.subscription_status === 'SUSPENDED'
          ? `Store '${updated.name}' (${updated.slug}.mypos.com) has been suspended immediately.`
          : updated.subscription_status === 'EXPIRED'
          ? `Store '${updated.name}' (${updated.slug}.mypos.com) subscription marked as expired.`
          : `Store '${updated.name}' (${updated.slug}.mypos.com) is now active.`,
    });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to toggle store status: ' + err.message });
  }
});

/**
 * 5A-2. SUPERADMIN MANAGE STORE SUBSCRIPTION, APP KEY & EXPIRY (`PATCH /api/superadmin/tenants/:id/subscription` & `POST /api/superadmin/tenants/:id/regenerate-key`)
 */
async function handleUpdateTenantSubscription(req: AuthenticatedRequest, res: Response) {
  try {
    await ensureSaasControlPlane();
    const tenantId = parseInt(req.params.id, 10);
    const {
      storeName,
      ownerName,
      ownerEmail,
      ownerPhone,
      subscriptionPlan,
      subscriptionStartDate,
      subscriptionEndDate,
      subscriptionStatus,
      appKey,
      regenerateKey,
      renewFromNow,
    } = req.body || {};

    const existingRes = await pgClient.query<any>('SELECT * FROM tenants WHERE id = $1 LIMIT 1', [tenantId]);
    if (existingRes.rows.length === 0) {
      return res.status(404).json({ error: 'Store tenant not found.' });
    }
    const curr = existingRes.rows[0];

    const finalStoreName = storeName && String(storeName).trim() ? String(storeName).trim() : curr.name;
    const finalOwnerName = ownerName !== undefined ? String(ownerName).trim() : curr.owner_name;
    const finalOwnerEmail = ownerEmail !== undefined ? String(ownerEmail).trim().toLowerCase() : curr.owner_email;
    const finalOwnerPhone = ownerPhone !== undefined ? String(ownerPhone).trim() : curr.owner_phone;

    const finalPlan = subscriptionPlan
      ? normalizeSubscriptionPlan(subscriptionPlan)
      : normalizeSubscriptionPlan(curr.subscription_plan);

    let finalAppKey = curr.app_key || (await generateUniqueAppKey());
    if (regenerateKey) {
      finalAppKey = await generateUniqueAppKey();
    } else if (appKey && String(appKey).trim() && String(appKey).trim() !== curr.app_key) {
      const candidateKey = String(appKey).trim().toUpperCase();
      const dupCheck = await pgClient.query(
        'SELECT id FROM tenants WHERE app_key = $1 AND id != $2 LIMIT 1',
        [candidateKey, tenantId]
      );
      if (dupCheck.rows.length > 0) {
        return res.status(409).json({ error: `App Key '${candidateKey}' is already assigned to another store.` });
      }
      finalAppKey = candidateKey;
    }

    let finalStartDate = subscriptionStartDate
      ? new Date(subscriptionStartDate)
      : renewFromNow
      ? new Date()
      : curr.subscription_start_date
      ? new Date(curr.subscription_start_date)
      : new Date();
    if (isNaN(finalStartDate.getTime())) {
      finalStartDate = new Date();
    }

    let finalEndDate: Date;
    if (subscriptionEndDate && String(subscriptionEndDate).trim()) {
      finalEndDate = new Date(subscriptionEndDate);
      // If a date-only string like YYYY-MM-DD was provided, set time to end of day 23:59:59
      if (/^\d{4}-\d{2}-\d{2}$/.test(String(subscriptionEndDate).trim())) {
        finalEndDate = new Date(`${String(subscriptionEndDate).trim()}T23:59:59.999Z`);
      }
    } else if (renewFromNow || (subscriptionPlan && subscriptionPlan !== curr.subscription_plan)) {
      finalEndDate = calculateSubscriptionEndDate(finalPlan, finalStartDate);
    } else if (curr.subscription_end_date) {
      finalEndDate = new Date(curr.subscription_end_date);
    } else {
      finalEndDate = calculateSubscriptionEndDate(finalPlan, finalStartDate);
    }

    if (isNaN(finalEndDate.getTime())) {
      finalEndDate = calculateSubscriptionEndDate(finalPlan, finalStartDate);
    }

    const isDateExpired = finalEndDate.getTime() < Date.now();
    let finalSubStatus: 'ACTIVE' | 'EXPIRED' | 'SUSPENDED' = curr.subscription_status || 'ACTIVE';
    if (subscriptionStatus && ['ACTIVE', 'EXPIRED', 'SUSPENDED'].includes(String(subscriptionStatus).toUpperCase())) {
      finalSubStatus = String(subscriptionStatus).toUpperCase() as 'ACTIVE' | 'EXPIRED' | 'SUSPENDED';
    } else if (renewFromNow) {
      finalSubStatus = 'ACTIVE';
    }

    // If subscriptionEndDate < now, enforce EXPIRED unless explicitly SUSPENDED
    if (isDateExpired && finalSubStatus !== 'SUSPENDED') {
      finalSubStatus = 'EXPIRED';
    } else if (!isDateExpired && finalSubStatus === 'EXPIRED') {
      // If SuperAdmin extended the expiry date into the future, automatically restore ACTIVE status
      finalSubStatus = 'ACTIVE';
    }

    const finalTenantStatus = finalSubStatus === 'SUSPENDED' ? 'SUSPENDED' : 'ACTIVE';

    const updatedRes = await pgClient.query(
      `UPDATE tenants
       SET name = $1,
           owner_name = $2,
           owner_email = $3,
           owner_phone = $4,
           app_key = $5,
           subscription_plan = $6,
           subscription_start_date = $7,
           subscription_end_date = $8,
           subscription_status = $9,
           status = $10,
           updated_at = NOW()
       WHERE id = $11
       RETURNING *`,
      [
        finalStoreName,
        finalOwnerName,
        finalOwnerEmail,
        finalOwnerPhone,
        finalAppKey,
        finalPlan,
        finalStartDate.toISOString(),
        finalEndDate.toISOString(),
        finalSubStatus,
        finalTenantStatus,
        tenantId,
      ]
    );

    // Sync store name with company_settings
    await pgClient
      .query(
        `UPDATE company_settings SET name = $1, updated_at = NOW() WHERE tenant_id = $2`,
        [finalStoreName, tenantId]
      )
      .catch(() => {});

    const row = updatedRes.rows[0];
    return res.json({
      success: true,
      tenant: {
        id: row.id,
        slug: row.slug,
        name: row.name,
        status: row.status,
        appKey: row.app_key,
        subscriptionPlan: row.subscription_plan,
        subscriptionStartDate: new Date(row.subscription_start_date).toISOString(),
        subscriptionEndDate: new Date(row.subscription_end_date).toISOString(),
        subscriptionStatus: row.subscription_status,
        ownerName: row.owner_name,
        ownerEmail: row.owner_email,
        ownerPhone: row.owner_phone,
      },
      message: `Subscription & App Key updated for '${row.name}' (${row.slug}.mypos.com).`,
    });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to update store subscription: ' + err.message });
  }
}

router.patch('/superadmin/tenants/:id/subscription', requireAuth, requireSuperAdmin, handleUpdateTenantSubscription);
router.put('/superadmin/tenants/:id', requireAuth, requireSuperAdmin, handleUpdateTenantSubscription);

router.post('/superadmin/tenants/:id/regenerate-key', requireAuth, requireSuperAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    await ensureSaasControlPlane();
    const tenantId = parseInt(req.params.id, 10);
    const newKey = await generateUniqueAppKey();
    const updateRes = await pgClient.query<{ id: number; slug: string; name: string; app_key: string }>(
      `UPDATE tenants
       SET app_key = $1, updated_at = NOW()
       WHERE id = $2
       RETURNING id, slug, name, app_key`,
      [newKey, tenantId]
    );
    if (updateRes.rows.length === 0) {
      return res.status(404).json({ error: 'Store tenant not found.' });
    }
    const row = updateRes.rows[0];
    return res.json({
      success: true,
      appKey: row.app_key,
      tenant: row,
      message: `Generated new App Key (${row.app_key}) for '${row.name}'.`,
    });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to regenerate App Key: ' + err.message });
  }
});

/**
 * Helper to provision a new tenant store + initial admin credentials + store_settings
 */
async function provisionNewTenantStore(params: {
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
}) {
  const cleanSlug = params.slug
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  const existing = await pgClient.query('SELECT id FROM tenants WHERE LOWER(slug) = $1', [cleanSlug]);
  if (existing.rows.length > 0) {
    throw new Error(`Subdomain '${cleanSlug}.mypos.com' is already provisioned.`);
  }

  const themeColor = params.themeColor || '#7C3AED';
  const currency = params.currency || 'PKR';
  const subscriptionPlan = normalizeSubscriptionPlan(params.subscriptionPlan || 'YEARLY');
  let appKey = params.appKey && params.appKey.trim() ? params.appKey.trim().toUpperCase() : await generateUniqueAppKey();
  const existingKey = await pgClient.query('SELECT id FROM tenants WHERE app_key = $1 LIMIT 1', [appKey]);
  if (existingKey.rows.length > 0) {
    appKey = await generateUniqueAppKey();
  }

  const startDate = params.subscriptionStartDate ? new Date(params.subscriptionStartDate) : new Date();
  const validStartDate = isNaN(startDate.getTime()) ? new Date() : startDate;
  let endDate = params.subscriptionEndDate
    ? new Date(params.subscriptionEndDate)
    : calculateSubscriptionEndDate(subscriptionPlan, validStartDate);
  if (isNaN(endDate.getTime())) {
    endDate = calculateSubscriptionEndDate(subscriptionPlan, validStartDate);
  }
  const subscriptionStatus = endDate.getTime() < Date.now() ? 'EXPIRED' : 'ACTIVE';

  const tenantInsert = await pgClient.query<{
    id: number;
    slug: string;
    name: string;
    app_key: string;
    subscription_plan: string;
    subscription_start_date: string;
    subscription_end_date: string;
    subscription_status: string;
  }>(
    `INSERT INTO tenants (
      slug, name, status, app_key, subscription_plan, subscription_start_date, subscription_end_date, subscription_status,
      theme_color, background_color, logo_url,
      owner_name, owner_email, owner_phone, address, tax_id, currency, plan, onboarding_completed, is_onboarded
    ) VALUES ($1, $2, 'ACTIVE', $3, $4, $5, $6, $7, $8, '#0F172A', '/pwa-512x512.png', $9, $10, $11, '', '', $12, $4, false, false)
    RETURNING id, slug, name, app_key, subscription_plan, subscription_start_date, subscription_end_date, subscription_status`,
    [
      cleanSlug,
      params.storeName.trim(),
      appKey,
      subscriptionPlan,
      validStartDate.toISOString(),
      endDate.toISOString(),
      subscriptionStatus,
      themeColor,
      params.ownerName.trim(),
      params.ownerEmail.trim().toLowerCase(),
      (params.ownerPhone || '').trim(),
      currency,
    ]
  );

  const newTenant = tenantInsert.rows[0];

  // Create isolated company_settings row for the new tenant (marked is_installed = false until Owner completes Initial Store Setup)
  await pgClient.query(
    `INSERT INTO company_settings (
      tenant_id, name, logo, address, phone, email, tax_id, tax_rate, currency, currency_symbol,
      invoice_prefix, purchase_prefix, barcode_prefix, invoice_footer, pricing_mode, is_installed
    ) VALUES ($1, $2, '/pwa-512x512.png', '', $3, $4, '', 0, $5, 'Rs.', 'INV-', 'PUR-', '0108923', 'Thank you for shopping with us! Exchanges within 7 days with original receipt.', 'FIXED', false)`,
    [
      newTenant.id,
      params.storeName.trim(),
      (params.ownerPhone || '').trim(),
      params.ownerEmail.trim().toLowerCase(),
      currency,
    ]
  );

  // Create initial Store Owner (ADMIN) and Store Cashier (CASHIER) users for this tenant
  const storeUsers = await ensureTenantStoreUsers({
    tenantId: newTenant.id,
    slug: cleanSlug,
    storeName: params.storeName.trim(),
    ownerName: params.ownerName.trim(),
    ownerEmail: params.ownerEmail.trim().toLowerCase(),
    ownerPhone: (params.ownerPhone || '').trim(),
    ownerPassword: params.password && params.password.trim() ? params.password.trim() : undefined,
  });

  return {
    tenantId: newTenant.id,
    slug: newTenant.slug,
    storeName: newTenant.name,
    subdomain: `${newTenant.slug}.mypos.com`,
    appKey: newTenant.app_key,
    subscriptionPlan: newTenant.subscription_plan,
    subscriptionStartDate: new Date(newTenant.subscription_start_date).toISOString(),
    subscriptionEndDate: new Date(newTenant.subscription_end_date).toISOString(),
    subscriptionStatus: newTenant.subscription_status,
    adminUserId: storeUsers.owner.id,
    adminEmail: storeUsers.owner.email,
    initialPassword: storeUsers.owner.password,
    cashierEmail: storeUsers.cashier.email,
    cashierPassword: storeUsers.cashier.password,
    onboardingCompleted: false,
    onboardingUrl: `/app/${newTenant.slug}/install`,
    loginUrl: `/app/${newTenant.slug}/login`,
    manifestUrl: `/api/tenants/${newTenant.slug}/manifest`,
  };
}

/**
 * Helper to format a SQL literal value safely for .sql backup export files
 */
function formatSqlValue(val: any): string {
  if (val === null || val === undefined) return 'NULL';
  if (typeof val === 'boolean') return val ? 'TRUE' : 'FALSE';
  if (typeof val === 'number') return Number.isFinite(val) ? String(val) : '0';
  if (val instanceof Date) return `'${val.toISOString().replace(/'/g, "''")}'`;
  if (typeof val === 'object') {
    return `'${JSON.stringify(val).replace(/'/g, "''")}'`;
  }
  return `'${String(val).replace(/'/g, "''")}'`;
}

async function generateTableInsertStatements(
  tableName: string,
  whereClause: string,
  params: any[] = []
): Promise<{ sql: string; count: number }> {
  try {
    const queryText = `SELECT * FROM ${tableName} ${whereClause}`;
    const res = await pgClient.query<any>(queryText, params);
    if (!res.rows || res.rows.length === 0) {
      return { sql: `-- Table: ${tableName} (0 rows)\n`, count: 0 };
    }
    const columns = Object.keys(res.rows[0]);
    const colList = columns.map((c) => `"${c}"`).join(', ');
    const lines: string[] = [`-- Table: ${tableName} (${res.rows.length} rows)`];
    for (const row of res.rows) {
      const vals = columns.map((col) => formatSqlValue(row[col])).join(', ');
      lines.push(`INSERT INTO "${tableName}" (${colList}) VALUES (${vals}) ON CONFLICT DO NOTHING;`);
    }
    lines.push('');
    return { sql: lines.join('\n'), count: res.rows.length };
  } catch {
    return { sql: `-- Table: ${tableName} (skipped)\n`, count: 0 };
  }
}

/**
 * 5B. SUPERADMIN EXPORT SINGLE STORE DATA TO SQL FILE (`GET /api/superadmin/tenants/:id/export-sql`)
 */
router.get('/superadmin/tenants/:id/export-sql', requireAuth, requireSuperAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    await ensureSaasControlPlane();
    const tenantId = parseInt(req.params.id, 10);
    const tenantRes = await pgClient.query<any>('SELECT * FROM tenants WHERE id = $1 LIMIT 1', [tenantId]);
    if (tenantRes.rows.length === 0) {
      return res.status(404).json({ error: 'Store tenant not found.' });
    }
    const tenant = tenantRes.rows[0];
    const dateStamp = new Date().toISOString().slice(0, 10);
    const filename = `store-${tenant.slug}-backup-${dateStamp}.sql`;

    const sections: string[] = [
      `-- ============================================================================`,
      `-- MyPOS Multi-Tenant SaaS — Store SQL Backup Dump`,
      `-- Store Name : ${tenant.name}`,
      `-- Subdomain  : ${tenant.slug}.mypos.com (Tenant ID #${tenant.id})`,
      `-- Exported At: ${new Date().toISOString()}`,
      `-- ============================================================================`,
      `BEGIN;`,
      ``,
    ];

    const tenantTables: Array<{ table: string; where: string; params: any[] }> = [
      { table: 'tenants', where: 'WHERE id = $1', params: [tenantId] },
      { table: 'company_settings', where: 'WHERE tenant_id = $1', params: [tenantId] },
      { table: 'users', where: "WHERE tenant_id = $1 AND role != 'SUPERADMIN' ORDER BY id ASC", params: [tenantId] },
      { table: 'brands', where: 'WHERE tenant_id = $1 ORDER BY id ASC', params: [tenantId] },
      { table: 'categories', where: 'WHERE tenant_id = $1 ORDER BY id ASC', params: [tenantId] },
      { table: 'products', where: 'WHERE tenant_id = $1 ORDER BY id ASC', params: [tenantId] },
      { table: 'suppliers', where: 'WHERE tenant_id = $1 ORDER BY id ASC', params: [tenantId] },
      { table: 'customers', where: 'WHERE tenant_id = $1 ORDER BY id ASC', params: [tenantId] },
      { table: 'purchases', where: 'WHERE tenant_id = $1 ORDER BY id ASC', params: [tenantId] },
      { table: 'purchase_items', where: 'WHERE tenant_id = $1 ORDER BY id ASC', params: [tenantId] },
      { table: 'supplier_payments', where: 'WHERE tenant_id = $1 ORDER BY id ASC', params: [tenantId] },
      { table: 'purchase_returns', where: 'WHERE tenant_id = $1 ORDER BY id ASC', params: [tenantId] },
      { table: 'purchase_return_items', where: 'WHERE tenant_id = $1 ORDER BY id ASC', params: [tenantId] },
      { table: 'sales', where: 'WHERE tenant_id = $1 ORDER BY id ASC', params: [tenantId] },
      { table: 'sale_items', where: 'WHERE tenant_id = $1 ORDER BY id ASC', params: [tenantId] },
      { table: 'returns', where: 'WHERE tenant_id = $1 ORDER BY id ASC', params: [tenantId] },
      { table: 'return_items', where: 'WHERE tenant_id = $1 ORDER BY id ASC', params: [tenantId] },
      { table: 'stock_movements', where: 'WHERE tenant_id = $1 ORDER BY id ASC', params: [tenantId] },
    ];

    let totalRows = 0;
    for (const item of tenantTables) {
      const dump = await generateTableInsertStatements(item.table, item.where, item.params);
      sections.push(dump.sql);
      totalRows += dump.count;
    }

    sections.push('COMMIT;');
    sections.push(`-- End of SQL Backup for ${tenant.name} (${totalRows} total records)`);

    return res.json({
      success: true,
      filename,
      storeName: tenant.name,
      slug: tenant.slug,
      totalRows,
      sql: sections.join('\n'),
    });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to export store SQL data: ' + err.message });
  }
});

/**
 * 5C. SUPERADMIN EXPORT ALL STORES / PLATFORM DATA TO SQL FILE (`GET /api/superadmin/export-sql`)
 */
router.get('/superadmin/export-sql', requireAuth, requireSuperAdmin, async (_req: AuthenticatedRequest, res: Response) => {
  try {
    await ensureSaasControlPlane();
    const dateStamp = new Date().toISOString().slice(0, 10);
    const filename = `mypos-all-stores-backup-${dateStamp}.sql`;

    const sections: string[] = [
      `-- ============================================================================`,
      `-- MyPOS Multi-Tenant SaaS — Complete Platform SQL Backup (All Stores)`,
      `-- Exported At: ${new Date().toISOString()}`,
      `-- ============================================================================`,
      `BEGIN;`,
      ``,
    ];

    const allTables = [
      'tenants',
      'store_requests',
      'company_settings',
      'users',
      'brands',
      'categories',
      'products',
      'suppliers',
      'customers',
      'purchases',
      'purchase_items',
      'supplier_payments',
      'purchase_returns',
      'purchase_return_items',
      'sales',
      'sale_items',
      'returns',
      'return_items',
      'stock_movements',
    ];

    let totalRows = 0;
    for (const tbl of allTables) {
      const dump = await generateTableInsertStatements(tbl, 'ORDER BY id ASC');
      sections.push(dump.sql);
      totalRows += dump.count;
    }

    sections.push('COMMIT;');
    sections.push(`-- End of Platform SQL Backup (${totalRows} total records)`);

    return res.json({
      success: true,
      filename,
      totalRows,
      sql: sections.join('\n'),
    });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to export platform SQL backup: ' + err.message });
  }
});

/**
 * 5D. SUPERADMIN DELETE STORE TENANT & ALL ISOLATED DATA (`DELETE /api/superadmin/tenants/:id` & `POST /api/superadmin/tenants/:id/delete`)
 */
async function handleDeleteTenantStore(req: AuthenticatedRequest, res: Response) {
  try {
    await ensureSaasControlPlane();
    const tenantId = parseInt(req.params.id, 10);
    if (!Number.isInteger(tenantId) || tenantId <= 0) {
      return res.status(400).json({ error: 'Invalid store tenant ID.' });
    }

    const tenantRes = await pgClient.query<{ id: number; slug: string; name: string }>(
      'SELECT id, slug, name FROM tenants WHERE id = $1 LIMIT 1',
      [tenantId]
    );

    if (tenantRes.rows.length === 0) {
      return res.status(404).json({ error: 'Store tenant not found or already deleted.' });
    }

    const store = tenantRes.rows[0];

    // Execute child-to-parent cleanup queries individually (outside a single transaction block so any optional table never aborts PostgreSQL transaction state)
    const orderedCleanupStatements: Array<{ sql: string; params: any[] }> = [
      {
        sql: `DELETE FROM return_items
              WHERE tenant_id = $1
                 OR return_id IN (SELECT id FROM returns WHERE tenant_id = $1)
                 OR sale_item_id IN (SELECT id FROM sale_items WHERE tenant_id = $1)
                 OR product_id IN (SELECT id FROM products WHERE tenant_id = $1)`,
        params: [tenantId],
      },
      {
        sql: `DELETE FROM returns
              WHERE tenant_id = $1
                 OR original_sale_id IN (SELECT id FROM sales WHERE tenant_id = $1)
                 OR created_by IN (SELECT id FROM users WHERE tenant_id = $1 AND role != 'SUPERADMIN')`,
        params: [tenantId],
      },
      {
        sql: `DELETE FROM sale_items
              WHERE tenant_id = $1
                 OR sale_id IN (SELECT id FROM sales WHERE tenant_id = $1)
                 OR product_id IN (SELECT id FROM products WHERE tenant_id = $1)`,
        params: [tenantId],
      },
      {
        sql: `DELETE FROM sales
              WHERE tenant_id = $1
                 OR created_by IN (SELECT id FROM users WHERE tenant_id = $1 AND role != 'SUPERADMIN')
                 OR overridden_by IN (SELECT id FROM users WHERE tenant_id = $1 AND role != 'SUPERADMIN')`,
        params: [tenantId],
      },
      {
        sql: `DELETE FROM purchase_return_items
              WHERE tenant_id = $1
                 OR purchase_return_id IN (SELECT id FROM purchase_returns WHERE tenant_id = $1)
                 OR product_id IN (SELECT id FROM products WHERE tenant_id = $1)`,
        params: [tenantId],
      },
      {
        sql: `DELETE FROM purchase_returns
              WHERE tenant_id = $1
                 OR purchase_id IN (SELECT id FROM purchases WHERE tenant_id = $1)
                 OR supplier_id IN (SELECT id FROM suppliers WHERE tenant_id = $1)
                 OR created_by IN (SELECT id FROM users WHERE tenant_id = $1 AND role != 'SUPERADMIN')`,
        params: [tenantId],
      },
      {
        sql: `DELETE FROM supplier_payments
              WHERE tenant_id = $1
                 OR supplier_id IN (SELECT id FROM suppliers WHERE tenant_id = $1)
                 OR purchase_id IN (SELECT id FROM purchases WHERE tenant_id = $1)
                 OR created_by IN (SELECT id FROM users WHERE tenant_id = $1 AND role != 'SUPERADMIN')`,
        params: [tenantId],
      },
      {
        sql: `DELETE FROM purchase_items
              WHERE tenant_id = $1
                 OR purchase_id IN (SELECT id FROM purchases WHERE tenant_id = $1)
                 OR product_id IN (SELECT id FROM products WHERE tenant_id = $1)`,
        params: [tenantId],
      },
      {
        sql: `DELETE FROM purchases
              WHERE tenant_id = $1
                 OR supplier_id IN (SELECT id FROM suppliers WHERE tenant_id = $1)
                 OR created_by IN (SELECT id FROM users WHERE tenant_id = $1 AND role != 'SUPERADMIN')`,
        params: [tenantId],
      },
      {
        sql: `DELETE FROM stock_movements
              WHERE tenant_id = $1
                 OR product_id IN (SELECT id FROM products WHERE tenant_id = $1)
                 OR user_id IN (SELECT id FROM users WHERE tenant_id = $1 AND role != 'SUPERADMIN')`,
        params: [tenantId],
      },
      { sql: `DELETE FROM products WHERE tenant_id = $1`, params: [tenantId] },
      { sql: `DELETE FROM brands WHERE tenant_id = $1`, params: [tenantId] },
      { sql: `DELETE FROM categories WHERE tenant_id = $1`, params: [tenantId] },
      { sql: `DELETE FROM customers WHERE tenant_id = $1`, params: [tenantId] },
      { sql: `DELETE FROM suppliers WHERE tenant_id = $1`, params: [tenantId] },
      {
        sql: `DELETE FROM password_reset_tokens
              WHERE tenant_id = $1
                 OR user_id IN (SELECT id FROM users WHERE tenant_id = $1 AND role != 'SUPERADMIN')`,
        params: [tenantId],
      },
      {
        sql: `DELETE FROM api_tokens
              WHERE tenant_id = $1
                 OR user_id IN (SELECT id FROM users WHERE tenant_id = $1 AND role != 'SUPERADMIN')`,
        params: [tenantId],
      },
      { sql: `DELETE FROM company_settings WHERE tenant_id = $1`, params: [tenantId] },
      { sql: `DELETE FROM users WHERE tenant_id = $1 AND role != 'SUPERADMIN'`, params: [tenantId] },
      { sql: `UPDATE store_requests SET provisioned_tenant_id = NULL WHERE provisioned_tenant_id = $1`, params: [tenantId] },
      { sql: `DELETE FROM store_requests WHERE LOWER(requested_slug) = LOWER($1)`, params: [store.slug] },
    ];

    for (const stmt of orderedCleanupStatements) {
      await pgClient.query(stmt.sql, stmt.params).catch(() => {});
    }

    // Finally delete the tenant record itself
    await pgClient.query('DELETE FROM tenants WHERE id = $1', [tenantId]);

    return res.json({
      success: true,
      deletedStore: store,
      message: `Store '${store.name}' (${store.slug}.mypos.com) and all its isolated records have been permanently deleted.`,
    });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to delete store tenant: ' + err.message });
  }
}

router.delete('/superadmin/tenants/:id', requireAuth, requireSuperAdmin, handleDeleteTenantStore);
router.post('/superadmin/tenants/:id/delete', requireAuth, requireSuperAdmin, handleDeleteTenantStore);

/**
 * 6. SUPERADMIN 1-CLICK STORE REQUEST / RENEWAL REQUEST APPROVAL (`POST /api/superadmin/store-requests/:id/approve`)
 */
router.post('/superadmin/store-requests/:id/approve', requireAuth, requireSuperAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const requestId = parseInt(req.params.id, 10);
    const { password, slug, storeName } = req.body || {};
    const reqRes = await pgClient.query<{
      id: number;
      store_name: string;
      requested_slug: string;
      owner_name: string;
      owner_email: string;
      owner_phone: string;
      plan: string;
      request_type?: string;
      provisioned_tenant_id?: number | null;
      status: string;
    }>('SELECT * FROM store_requests WHERE id = $1', [requestId]);

    if (reqRes.rows.length === 0) {
      return res.status(404).json({ error: 'Store request not found.' });
    }

    const storeReq = reqRes.rows[0];
    if (storeReq.status === 'APPROVED') {
      return res.status(400).json({ error: 'This request has already been approved.' });
    }

    const targetSlug = slug && String(slug).trim() ? String(slug).trim().toLowerCase() : String(storeReq.requested_slug || '').trim().toLowerCase();

    // Check if this request is for an existing store (RENEWAL request or matching existing tenant)
    const existingTenantRes = await pgClient.query<any>(
      `SELECT * FROM tenants
       WHERE ($1::integer IS NOT NULL AND id = $1)
          OR LOWER(slug) = LOWER($2)
       ORDER BY id ASC
       LIMIT 1`,
      [storeReq.provisioned_tenant_id || null, targetSlug]
    );

    if (existingTenantRes.rows.length > 0) {
      const existingTenant = existingTenantRes.rows[0];
      const finalPlan = normalizeSubscriptionPlan(
        req.body?.subscriptionPlan || storeReq.plan || existingTenant.subscription_plan || 'YEARLY'
      );
      const finalAppKey = existingTenant.app_key && String(existingTenant.app_key).trim()
        ? String(existingTenant.app_key).trim()
        : await generateUniqueAppKey();

      // Extend from existing expiry if still in the future, otherwise from now
      const currEnd = existingTenant.subscription_end_date ? new Date(existingTenant.subscription_end_date) : new Date(0);
      const extensionBase = !Number.isNaN(currEnd.getTime()) && currEnd.getTime() > Date.now() ? currEnd : new Date();
      const newEndDate = calculateSubscriptionEndDate(finalPlan, extensionBase);
      const newStartDate = new Date();

      const updatedTenantRes = await pgClient.query<any>(
        `UPDATE tenants
         SET app_key = $1,
             subscription_plan = $2,
             subscription_start_date = $3,
             subscription_end_date = $4,
             subscription_status = 'ACTIVE',
             status = 'ACTIVE',
             updated_at = NOW()
         WHERE id = $5
         RETURNING *`,
        [finalAppKey, finalPlan, newStartDate.toISOString(), newEndDate.toISOString(), existingTenant.id]
      );

      await pgClient.query(
        `UPDATE store_requests
         SET status = 'APPROVED',
             provisioned_tenant_id = $1,
             updated_at = NOW()
         WHERE id = $2`,
        [existingTenant.id, requestId]
      );

      const updatedTenant = updatedTenantRes.rows[0];
      const planLabel = finalPlan === '6_MONTHS' ? '6 Months' : 'Yearly';
      const formattedExpiry = newEndDate.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });

      return res.status(200).json({
        success: true,
        renewed: true,
        provisioned: {
          tenantId: updatedTenant.id,
          slug: updatedTenant.slug,
          storeName: updatedTenant.name,
          subdomain: `${updatedTenant.slug}.mypos.com`,
          appKey: updatedTenant.app_key,
          subscriptionPlan: updatedTenant.subscription_plan,
          subscriptionStartDate: new Date(updatedTenant.subscription_start_date).toISOString(),
          subscriptionEndDate: new Date(updatedTenant.subscription_end_date).toISOString(),
          subscriptionStatus: 'ACTIVE',
        },
        message: `Subscription renewed (${planLabel}) for '${updatedTenant.name}' (${updatedTenant.slug}.mypos.com) until ${formattedExpiry}!`,
      });
    }

    await pgClient.query('BEGIN');
    const provisioned = await provisionNewTenantStore({
      storeName: storeName && String(storeName).trim() ? String(storeName).trim() : storeReq.store_name,
      slug: slug && String(slug).trim() ? String(slug).trim() : storeReq.requested_slug,
      ownerName: storeReq.owner_name,
      ownerEmail: storeReq.owner_email,
      ownerPhone: storeReq.owner_phone,
      password: password && String(password).trim() ? String(password).trim() : undefined,
      subscriptionPlan: req.body?.subscriptionPlan || (storeReq as any).plan || 'YEARLY',
    });

    await pgClient.query(
      `UPDATE store_requests SET status = 'APPROVED', requested_slug = $1, provisioned_tenant_id = $2, updated_at = NOW() WHERE id = $3`,
      [provisioned.slug, provisioned.tenantId, requestId]
    );
    await pgClient.query('COMMIT');

    return res.status(201).json({
      success: true,
      provisioned,
      message: `Store '${provisioned.storeName}' (${provisioned.subdomain}) provisioned!`,
    });
  } catch (err: any) {
    await pgClient.query('ROLLBACK').catch(() => {});
    return res.status(400).json({ error: err.message || 'Failed to provision store.' });
  }
});

/**
 * 7. SUPERADMIN REJECT / UPDATE / DELETE STORE REQUESTS
 */
router.post('/superadmin/store-requests/:id/reject', requireAuth, requireSuperAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const requestId = parseInt(req.params.id, 10);
    await pgClient.query(`UPDATE store_requests SET status = 'REJECTED' WHERE id = $1`, [requestId]);
    return res.json({ success: true, message: 'Store request marked as rejected.' });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to reject request: ' + err.message });
  }
});

router.patch('/superadmin/store-requests/:id', requireAuth, requireSuperAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const requestId = parseInt(req.params.id, 10);
    const { status, storeName, requestedSlug, ownerName, ownerEmail, ownerPhone, plan } = req.body || {};

    const existingRes = await pgClient.query<any>('SELECT * FROM store_requests WHERE id = $1', [requestId]);
    if (existingRes.rows.length === 0) {
      return res.status(404).json({ error: 'Store request not found.' });
    }
    const curr = existingRes.rows[0];

    const nextStatus = status && ['PENDING', 'APPROVED', 'REJECTED'].includes(String(status).toUpperCase())
      ? String(status).toUpperCase()
      : curr.status;
    const nextStoreName = storeName !== undefined ? String(storeName).trim() : curr.store_name;
    const nextSlug = requestedSlug !== undefined
      ? String(requestedSlug).trim().toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')
      : curr.requested_slug;
    const nextOwnerName = ownerName !== undefined ? String(ownerName).trim() : curr.owner_name;
    const nextOwnerEmail = ownerEmail !== undefined ? String(ownerEmail).trim().toLowerCase() : curr.owner_email;
    const nextOwnerPhone = ownerPhone !== undefined ? String(ownerPhone).trim() : curr.owner_phone;
    const nextPlan = plan !== undefined ? String(plan).trim() : curr.plan;

    const updatedRes = await pgClient.query(
      `UPDATE store_requests
       SET status = $1,
           store_name = $2,
           requested_slug = $3,
           owner_name = $4,
           owner_email = $5,
           owner_phone = $6,
           plan = $7
       WHERE id = $8
       RETURNING *`,
      [nextStatus, nextStoreName, nextSlug, nextOwnerName, nextOwnerEmail, nextOwnerPhone, nextPlan, requestId]
    );

    return res.json({
      success: true,
      request: updatedRes.rows[0],
      message: `Store request #${requestId} updated.`,
    });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to update store request: ' + err.message });
  }
});

async function handleDeleteStoreRequest(req: AuthenticatedRequest, res: Response) {
  try {
    await ensureSaasControlPlane();
    const requestId = parseInt(req.params.id, 10);
    if (!Number.isInteger(requestId) || requestId <= 0) {
      return res.status(400).json({ error: 'Invalid store request ID.' });
    }

    const existingRes = await pgClient.query<{
      id: number;
      store_name: string;
      requested_slug: string;
    }>('SELECT id, store_name, requested_slug FROM store_requests WHERE id = $1 LIMIT 1', [requestId]);

    const target = existingRes.rows[0];
    const slugToRecord = target?.requested_slug || String(req.body?.requestedSlug || '').trim().toLowerCase();

    if (slugToRecord) {
      await pgClient
        .query(
          `INSERT INTO deleted_store_requests (request_id, requested_slug) VALUES ($1, $2)`,
          [requestId, slugToRecord]
        )
        .catch(() => {});
    }

    if (target) {
      await pgClient.query(
        `DELETE FROM store_requests
         WHERE id = $1
            OR (LOWER(requested_slug) = LOWER($2) AND LOWER(store_name) = LOWER($3))`,
        [requestId, target.requested_slug || '', target.store_name || '']
      );
    } else {
      await pgClient.query('DELETE FROM store_requests WHERE id = $1', [requestId]);
    }

    return res.json({
      success: true,
      deletedId: requestId,
      message: target
        ? `Store request '${target.store_name}' permanently deleted.`
        : 'Store request permanently deleted.',
    });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to delete store request: ' + err.message });
  }
}

router.delete('/superadmin/store-requests/:id', requireAuth, requireSuperAdmin, handleDeleteStoreRequest);
router.post('/superadmin/store-requests/:id/delete', requireAuth, requireSuperAdmin, handleDeleteStoreRequest);

/**
 * 8. SUPERADMIN DIRECT STORE CREATION (`POST /api/superadmin/tenants`)
 * Minimal Required Fields Only: Store Name, Owner Name, Owner Email, Password, Subdomain Slug
 */
router.post('/superadmin/tenants', requireAuth, requireSuperAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const {
      storeName,
      slug,
      ownerName,
      ownerEmail,
      password,
      ownerPhone,
      themeColor,
      currency,
      subscriptionPlan,
      appKey,
      subscriptionStartDate,
      subscriptionEndDate,
    } = req.body || {};
    if (!storeName || !slug || !ownerName || !ownerEmail) {
      return res.status(400).json({ error: 'Store name, subdomain slug, owner name, and owner email are required.' });
    }
    if (password !== undefined && String(password).trim().length > 0 && String(password).trim().length < 4) {
      return res.status(400).json({ error: 'Owner password must be at least 4 characters.' });
    }

    await pgClient.query('BEGIN');
    const provisioned = await provisionNewTenantStore({
      storeName,
      slug,
      ownerName,
      ownerEmail,
      password: password ? String(password).trim() : undefined,
      ownerPhone,
      themeColor,
      currency,
      subscriptionPlan: subscriptionPlan || 'YEARLY',
      appKey,
      subscriptionStartDate,
      subscriptionEndDate,
    });
    await pgClient.query('COMMIT');

    return res.status(201).json({
      success: true,
      provisioned,
      message: `Store '${provisioned.storeName}' created at ${provisioned.subdomain}`,
    });
  } catch (err: any) {
    await pgClient.query('ROLLBACK').catch(() => {});
    return res.status(400).json({ error: err.message || 'Failed to create tenant store.' });
  }
});

/**
 * 9. TENANT FIRST-TIME OWNER INITIAL STORE SETUP GET & POST (`/api/tenants/:slug/onboarding`)
 * Configures essential store defaults for a newly created store before granting full Owner portal access:
 * - Invoice Prefix (e.g., INV-) & Purchase Prefix (e.g., PUR-)
 * - Barcode Prefix / Settings & Low Stock Threshold
 * - Store Contact Details & Physical Address
 * - Tax Rates, Tax ID / STRN & Receipt Footer Notes
 */
router.get('/tenants/:slug/onboarding', async (req: Request, res: Response) => {
  try {
    await ensureSaasControlPlane();
    const slug = String(req.params.slug || '').trim().toLowerCase();
    const tenantRes = await pgClient.query(
      `SELECT t.*,
              (SELECT email FROM users u WHERE u.tenant_id = t.id AND u.role = 'ADMIN' ORDER BY id ASC LIMIT 1) as admin_email,
              (SELECT COUNT(*) FROM products p WHERE p.tenant_id = t.id)::int as product_count
       FROM tenants t
       WHERE LOWER(t.slug) = $1
       LIMIT 1`,
      [slug]
    );

    if (tenantRes.rows.length === 0) {
      return res.status(404).json({ error: `Store '${slug}' not found.` });
    }

    const t: any = tenantRes.rows[0];
    const settingsRes = await pgClient.query<any>(
      'SELECT * FROM company_settings WHERE tenant_id = $1 LIMIT 1',
      [t.id]
    );
    const cs = settingsRes.rows[0] || {};

    return res.json({
      tenant: {
        id: t.id,
        slug: t.slug,
        name: t.name,
        status: t.status,
        address: cs.address || t.address || '',
        taxId: cs.tax_id || t.tax_id || '',
        strn: cs.strn || '',
        taxRate: Number(cs.tax_rate) || 0,
        currency: cs.currency || t.currency || 'PKR',
        currencySymbol: cs.currency_symbol || t.currency_symbol || 'Rs.',
        invoicePrefix: cs.invoice_prefix || 'INV-',
        purchasePrefix: cs.purchase_prefix || 'PUR-',
        barcodePrefix: cs.barcode_prefix || '0108923',
        invoiceFooter:
          cs.invoice_footer ||
          'Thank you for shopping with us! Exchanges accepted within 7 days with original receipt.',
        lowStockLimit: Number(cs.low_stock_limit) || 5,
        pricingMode: cs.pricing_mode || 'FIXED',
        themeColor: t.theme_color || '#7C3AED',
        backgroundColor: t.background_color || '#0F172A',
        logoUrl: cs.logo || t.logo_url || '/pwa-512x512.png',
        ownerName: t.owner_name || 'Store Owner',
        ownerEmail: cs.email || t.admin_email || t.owner_email || '',
        ownerPhone: cs.phone || t.owner_phone || '',
        onboardingCompleted: Boolean(t.onboarding_completed),
        productCount: t.product_count || 0,
      },
    });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to load onboarding state: ' + err.message });
  }
});

router.post('/tenants/:slug/onboarding', async (req: Request, res: Response) => {
  try {
    await ensureSaasControlPlane();
    const slug = String(req.params.slug || '').trim().toLowerCase();

    const tenantRes = await pgClient.query<{
      id: number;
      slug: string;
      name: string;
      status: string;
      owner_name: string;
      owner_email: string;
    }>(
      `SELECT id, slug, name, status, owner_name, owner_email FROM tenants WHERE LOWER(slug) = $1 LIMIT 1`,
      [slug]
    );

    if (tenantRes.rows.length === 0) {
      return res.status(404).json({ error: `Store '${slug}' does not exist.` });
    }

    const tenant = tenantRes.rows[0];

    const {
      storeName,
      address,
      taxId,
      strn,
      taxRate,
      currency,
      currencySymbol,
      phone,
      email,
      invoicePrefix,
      purchasePrefix,
      barcodePrefix,
      invoiceFooter,
      lowStockLimit,
      pricingMode,
      themeColor,
      backgroundColor,
      logoUrl,
      adminPassword,
      initialProducts,
    } = req.body || {};

    await pgClient.query('BEGIN');

    const finalName = storeName && String(storeName).trim() ? String(storeName).trim() : tenant.name;
    const finalAddress = String(address || '').trim();
    const finalTaxId = String(taxId || '').trim();
    const finalStrn = String(strn || '').trim();
    const finalTaxRate = Math.max(0, Math.min(100, Number(taxRate) || 0));
    const finalCurrency = String(currency || 'PKR').trim();
    const finalCurrencySymbol = String(
      currencySymbol ||
        (finalCurrency === 'USD'
          ? '$'
          : finalCurrency === 'AED'
          ? 'AED'
          : finalCurrency === 'SAR'
          ? 'SAR'
          : finalCurrency === 'GBP'
          ? '£'
          : finalCurrency === 'EUR'
          ? '€'
          : 'Rs.')
    ).trim();
    const finalInvoicePrefix = String(invoicePrefix || 'INV-').trim() || 'INV-';
    const finalPurchasePrefix = String(purchasePrefix || 'PUR-').trim() || 'PUR-';
    const finalBarcodePrefix = String(barcodePrefix || '0108923').trim() || '0108923';
    const finalInvoiceFooter =
      String(
        invoiceFooter ||
          'Thank you for shopping with us! Exchanges accepted within 7 days with original receipt.'
      ).trim();
    const finalLowStockLimit = Math.max(1, parseInt(String(lowStockLimit ?? 5), 10) || 5);
    const finalPricingMode = String(pricingMode || 'FIXED').toUpperCase() === 'NEGOTIABLE' ? 'NEGOTIABLE' : 'FIXED';
    const finalThemeColor = String(themeColor || '#7C3AED').trim();
    const finalBgColor = String(backgroundColor || '#0F172A').trim();
    const finalLogoUrl = String(logoUrl || '/pwa-512x512.png').trim();
    const finalPhone = String(phone || '').trim();
    const finalEmail = String(email || tenant.owner_email || '').trim().toLowerCase();

    // Update tenants table and mark store ACTIVE + onboarded
    await pgClient.query(
      `UPDATE tenants
       SET name = $1,
           address = $2,
           business_address = $2,
           tax_id = $3,
           currency = $4,
           currency_symbol = $5,
           theme_color = $6,
           background_color = $7,
           logo_url = $8,
           owner_phone = COALESCE(NULLIF($9, ''), owner_phone),
           owner_email = COALESCE(NULLIF($10, ''), owner_email),
           status = 'ACTIVE',
           onboarding_completed = true,
           is_onboarded = true,
           updated_at = NOW()
       WHERE id = $11`,
      [
        finalName,
        finalAddress,
        finalTaxId,
        finalCurrency,
        finalCurrencySymbol,
        finalThemeColor,
        finalBgColor,
        finalLogoUrl,
        finalPhone,
        finalEmail,
        tenant.id,
      ]
    );

    // Sync tenant company_settings with all configured Initial Store Setup defaults
    const settingsCheck = await pgClient.query('SELECT id FROM company_settings WHERE tenant_id = $1 LIMIT 1', [tenant.id]);
    if (settingsCheck.rows.length > 0) {
      await pgClient.query(
        `UPDATE company_settings
         SET name = $1,
             logo = $2,
             address = $3,
             tax_id = $4,
             strn = $5,
             tax_rate = $6,
             currency = $7,
             currency_symbol = $8,
             phone = COALESCE(NULLIF($9, ''), phone),
             email = COALESCE(NULLIF($10, ''), email),
             invoice_prefix = $11,
             purchase_prefix = $12,
             barcode_prefix = $13,
             invoice_footer = $14,
             low_stock_limit = $15,
             pricing_mode = $16,
             is_installed = true,
             updated_at = NOW()
         WHERE tenant_id = $17`,
        [
          finalName,
          finalLogoUrl,
          finalAddress,
          finalTaxId,
          finalStrn,
          finalTaxRate,
          finalCurrency,
          finalCurrencySymbol,
          finalPhone,
          finalEmail,
          finalInvoicePrefix,
          finalPurchasePrefix,
          finalBarcodePrefix,
          finalInvoiceFooter,
          finalLowStockLimit,
          finalPricingMode,
          tenant.id,
        ]
      );
    } else {
      await pgClient.query(
        `INSERT INTO company_settings (
           tenant_id, name, logo, address, tax_id, strn, tax_rate, currency, currency_symbol,
           phone, email, invoice_prefix, purchase_prefix, barcode_prefix, invoice_footer,
           low_stock_limit, pricing_mode, is_installed
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, true)`,
        [
          tenant.id,
          finalName,
          finalLogoUrl,
          finalAddress,
          finalTaxId,
          finalStrn,
          finalTaxRate,
          finalCurrency,
          finalCurrencySymbol,
          finalPhone,
          finalEmail,
          finalInvoicePrefix,
          finalPurchasePrefix,
          finalBarcodePrefix,
          finalInvoiceFooter,
          finalLowStockLimit,
          finalPricingMode,
        ]
      );
    }

    // Ensure Owner & Cashier accounts exist
    const ensuredUsers = await ensureTenantStoreUsers({
      tenantId: tenant.id,
      slug: tenant.slug,
      storeName: finalName,
      ownerName: tenant.owner_name,
      ownerEmail: finalEmail || tenant.owner_email,
      ownerPhone: finalPhone,
    });
    const adminUser: any = ensuredUsers.owner;

    if (adminPassword && String(adminPassword).trim().length >= 4) {
      const cleanPass = String(adminPassword).trim();
      const hash = bcrypt.hashSync(cleanPass, 10);
      await pgClient.query(
        `UPDATE users SET password_hash = $1, quick_password = $2, status = 'APPROVED', active = true WHERE id = $3 AND tenant_id = $4`,
        [hash, cleanPass, adminUser.id, tenant.id]
      );
    }

    // Optional initial inventory items if provided
    if (Array.isArray(initialProducts) && initialProducts.length > 0) {
      for (let i = 0; i < initialProducts.length; i++) {
        const item = initialProducts[i];
        if (!item || !item.name || !String(item.name).trim()) continue;
        const pName = String(item.name).trim();
        const pBrand = String(item.brand || 'StepSync').trim();
        const pCategory = String(item.category || 'Sneakers').trim();
        const pCost = Math.max(0, Number(item.purchasePrice) || 2000);
        const pSell = Math.max(1, Number(item.sellingPrice) || 3500);
        const pStock = Math.max(0, parseInt(String(item.stock ?? 15), 10) || 15);
        const pSku =
          item.sku && String(item.sku).trim()
            ? String(item.sku).trim()
            : `${tenant.slug.toUpperCase().slice(0, 4)}-${Date.now().toString().slice(-4)}-${i + 1}`;
        const pBarcode =
          item.barcode && String(item.barcode).trim()
            ? String(item.barcode).trim()
            : `${finalBarcodePrefix.slice(0, 2)}${String(tenant.id).padStart(2, '0')}${String(i + 1).padStart(3, '0')}`;

        await pgClient.query(
          `INSERT INTO products (
            tenant_id, name, article, sku, barcode, brand, category,
            cost_price, selling_price, min_price, max_price, pricing_policy, total_stock, low_stock_limit, primary_image_url, active
          ) VALUES ($1, $2, $2, $3, $4, $5, $6, $7, $8, $8, $8, $9, $10, $11, '/assets/images/hd-07.jpg', true)`,
          [tenant.id, pName, pSku, pBarcode, pBrand, pCategory, pCost, pSell, finalPricingMode, pStock, finalLowStockLimit]
        );
      }
    }

    await pgClient.query('COMMIT');

    // Issue fresh tenant-scoped JWT token for immediate login after setup
    let token: string | null = null;
    if (adminUser) {
      token = generateToken({
        id: adminUser.id,
        tenantId: tenant.id,
        slug: tenant.slug,
        name: adminUser.name,
        email: adminUser.email,
        role: 'ADMIN',
        status: 'APPROVED',
      });
    }

    const updatedSettingsRes = await pgClient.query('SELECT * FROM company_settings WHERE tenant_id = $1 LIMIT 1', [tenant.id]);

    return res.json({
      success: true,
      message: `Initial store setup completed for ${finalName}!`,
      token,
      user: adminUser
        ? {
            id: adminUser.id,
            tenantId: tenant.id,
            slug: tenant.slug,
            tenantName: finalName,
            name: adminUser.name,
            email: adminUser.email,
            role: 'ADMIN',
            originalRole: 'ADMIN',
            status: 'APPROVED',
            onboardingCompleted: true,
          }
        : null,
      settings: updatedSettingsRes.rows[0] || null,
      manifestUrl: `/api/tenants/${tenant.slug}/manifest`,
      redirectUrl: `/app/${tenant.slug}`,
    });
  } catch (err: any) {
    await pgClient.query('ROLLBACK').catch(() => {});
    return res.status(500).json({ error: 'Failed to complete initial store setup: ' + err.message });
  }
});

export default router;
