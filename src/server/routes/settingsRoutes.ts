import { Router } from 'express';
import type { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { pgClient } from '../../db/index.ts';
import {
  ensureSaasControlPlane,
  generateUniqueAppKey,
  normalizeSubscriptionPlan,
  calculateSubscriptionEndDate,
  syncExpiredTenantSubscriptions,
} from '../../db/schemaInit.ts';
import { requireAuth, requireAdmin } from '../auth.ts';
import type { AuthenticatedRequest } from '../auth.ts';
import { extractStrictTenantId } from '../../db/tenantDb.ts';

const JWT_SECRET = process.env.JWT_SECRET || 'shoe-pos-super-secure-jwt-secret-key-2026';

const router = Router();

let settingsColumnsVerified = false;

async function ensureSettingsPricingColumns() {
  if (settingsColumnsVerified) return;
  try {
    await ensureSaasControlPlane();
    settingsColumnsVerified = true;
  } catch (err) {
    console.warn('Could not ensure settings pricing columns:', err);
  }
}

async function resolvePublicOrAuthTenantId(req: Request): Promise<number> {
  const slug = (
    (req.headers['x-tenant-slug'] as string | undefined) ||
    (req.query.slug as string | undefined) ||
    ''
  ).trim().toLowerCase();

  const customToken = typeof req.headers['x-auth-token'] === 'string' ? req.headers['x-auth-token'].trim() : '';
  const authHeader = req.headers.authorization;
  const rawToken = customToken || (authHeader && authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : '');

  let tokenTenantId: number | null = null;
  let tokenRole = '';
  let tokenSlug = '';

  if (rawToken) {
    try {
      const decoded: any = jwt.verify(rawToken, JWT_SECRET);
      if (decoded?.tenantId && Number(decoded.tenantId) > 0) {
        tokenTenantId = Number(decoded.tenantId);
      }
      tokenRole = String(decoded?.role || '').toUpperCase();
      tokenSlug = String(decoded?.slug || '').toLowerCase();
    } catch (_) {}
  }

  // If a specific store slug header/query is passed and either no token is present, user is SUPERADMIN, or slug differs
  if (slug && slug !== 'admin' && slug !== 'default' && slug !== 'superadmin') {
    if (!tokenTenantId || tokenRole === 'SUPERADMIN' || (tokenSlug && tokenSlug !== slug)) {
      try {
        const tRes = await pgClient.query<{ id: number }>(
          'SELECT id FROM tenants WHERE LOWER(slug) = LOWER($1) LIMIT 1',
          [slug]
        );
        if (tRes.rows[0]?.id) {
          return tRes.rows[0].id;
        }
      } catch (_) {}
    }
  }

  if (tokenTenantId) {
    return tokenTenantId;
  }

  if (slug && slug !== 'admin' && slug !== 'default') {
    try {
      const tRes = await pgClient.query<{ id: number }>(
        'SELECT id FROM tenants WHERE LOWER(slug) = LOWER($1) LIMIT 1',
        [slug]
      );
      if (tRes.rows[0]?.id) {
        return tRes.rows[0].id;
      }
    } catch (_) {}
  }

  return 1;
}

async function ensureTenantSubscriptionPopulated(tenantId: number): Promise<any> {
  try {
    await syncExpiredTenantSubscriptions();
    let tenantRes = await pgClient.query('SELECT * FROM tenants WHERE id = $1 LIMIT 1', [tenantId]);
    if (tenantRes.rows.length === 0) {
      tenantRes = await pgClient.query('SELECT * FROM tenants ORDER BY id ASC LIMIT 1');
    }
    const t = tenantRes.rows[0];
    if (!t) return null;

    let needsUpdate = false;
    let appKey = t.app_key && String(t.app_key).trim() ? String(t.app_key).trim() : '';
    if (!appKey) {
      appKey = await generateUniqueAppKey();
      needsUpdate = true;
    }

    const plan = normalizeSubscriptionPlan(
      t.subscription_plan || (t.slug === 'mystore' || t.slug === 'apex-boots' ? '6_MONTHS' : 'YEARLY')
    );
    if (t.subscription_plan !== plan) {
      needsUpdate = true;
    }

    const startDt = t.subscription_start_date ? new Date(t.subscription_start_date) : new Date();
    const endDt = t.subscription_end_date
      ? new Date(t.subscription_end_date)
      : calculateSubscriptionEndDate(plan, startDt);
    if (!t.subscription_start_date || !t.subscription_end_date) {
      needsUpdate = true;
    }

    const isExpiredNow = endDt.getTime() < Date.now();
    let subStatus = String(t.subscription_status || '').toUpperCase();
    if (String(t.status || '').toUpperCase() === 'SUSPENDED') {
      subStatus = 'SUSPENDED';
    } else if (isExpiredNow) {
      subStatus = 'EXPIRED';
    } else if (!['ACTIVE', 'EXPIRED', 'SUSPENDED'].includes(subStatus)) {
      subStatus = 'ACTIVE';
    }
    if (t.subscription_status !== subStatus) {
      needsUpdate = true;
    }

    if (needsUpdate) {
      const updated = await pgClient.query(
        `UPDATE tenants
         SET app_key = $1,
             subscription_plan = $2,
             subscription_start_date = $3,
             subscription_end_date = $4,
             subscription_status = $5,
             updated_at = NOW()
         WHERE id = $6
         RETURNING *`,
        [appKey, plan, startDt.toISOString(), endDt.toISOString(), subStatus, t.id]
      );
      return updated.rows[0] || t;
    }

    return t;
  } catch {
    return null;
  }
}

async function getPendingRenewalRequest(tenantId: number, slug?: string): Promise<any | null> {
  try {
    await pgClient.exec(`
      ALTER TABLE store_requests ADD COLUMN IF NOT EXISTS request_type TEXT NOT NULL DEFAULT 'NEW_STORE';
      ALTER TABLE store_requests ADD COLUMN IF NOT EXISTS notes TEXT DEFAULT '';
      ALTER TABLE store_requests ADD COLUMN IF NOT EXISTS provisioned_tenant_id INTEGER;
    `).catch(() => {});

    const cleanSlug = String(slug || '').trim().toLowerCase();
    const res = await pgClient.query(
      `SELECT id, store_name, requested_slug, owner_name, owner_email, owner_phone, plan, request_type, notes, status, provisioned_tenant_id, created_at, updated_at
       FROM store_requests
       WHERE status = 'PENDING'
         AND (
           provisioned_tenant_id = $1
           OR ($2 != '' AND LOWER(requested_slug) = LOWER($2))
         )
       ORDER BY id DESC
       LIMIT 1`,
      [tenantId, cleanSlug]
    );
    return res.rows[0] || null;
  } catch {
    return null;
  }
}

function buildSubscriptionInfo(tenantRow?: any, pendingRenewalRequest?: any | null) {
  const appKey = tenantRow?.app_key || 'APP-KEY-TJS1-9X4A';
  const subscriptionPlan = normalizeSubscriptionPlan(tenantRow?.subscription_plan || 'YEARLY');
  const startDt = tenantRow?.subscription_start_date
    ? new Date(tenantRow.subscription_start_date)
    : new Date();
  const endDt = tenantRow?.subscription_end_date
    ? new Date(tenantRow.subscription_end_date)
    : calculateSubscriptionEndDate(subscriptionPlan, startDt);

  const startIso = !Number.isNaN(startDt.getTime()) ? startDt.toISOString() : new Date().toISOString();
  const endIso = !Number.isNaN(endDt.getTime())
    ? endDt.toISOString()
    : calculateSubscriptionEndDate(subscriptionPlan, new Date()).toISOString();

  const diffMs = new Date(endIso).getTime() - Date.now();
  const daysRemaining = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
  const isExpired = diffMs < 0 || String(tenantRow?.subscription_status || '').toUpperCase() === 'EXPIRED';
  const subscriptionStatus =
    String(tenantRow?.status || '').toUpperCase() === 'SUSPENDED' ||
    String(tenantRow?.subscription_status || '').toUpperCase() === 'SUSPENDED'
      ? 'SUSPENDED'
      : isExpired
      ? 'EXPIRED'
      : 'ACTIVE';

  return {
    appKey,
    app_key: appKey,
    plan: subscriptionPlan,
    subscriptionPlan,
    subscription_plan: subscriptionPlan,
    startDate: startIso,
    subscriptionStartDate: startIso,
    subscription_start_date: startIso,
    endDate: endIso,
    subscriptionEndDate: endIso,
    subscription_end_date: endIso,
    status: subscriptionStatus,
    subscriptionStatus,
    subscription_status: subscriptionStatus,
    daysRemaining,
    isExpired,
    pendingRenewalRequest: pendingRenewalRequest || null,
  };
}

function formatSettingsResponse(s: any, tenantRow?: any, pendingRenewalRequest?: any | null) {
  const mode = String(s.pricing_mode || 'FIXED').toUpperCase() === 'NEGOTIABLE' ? 'NEGOTIABLE' : 'FIXED';
  const locked = false;
  const logo = s.logo || tenantRow?.logo_url || '';
  const receiptLogo = s.receipt_logo || logo || '';
  const showReceiptLogo = Boolean(s.show_receipt_logo);
  const subInfo = buildSubscriptionInfo(tenantRow, pendingRenewalRequest);

  return {
    id: s.id,
    tenantId: s.tenant_id || tenantRow?.id || 1,
    slug: tenantRow?.slug || 'tj-shoes',
    tenantStatus: tenantRow?.status || 'ACTIVE',
    appKey: subInfo.appKey,
    app_key: subInfo.appKey,
    subscriptionPlan: subInfo.subscriptionPlan,
    subscription_plan: subInfo.subscriptionPlan,
    subscriptionStartDate: subInfo.subscriptionStartDate,
    subscription_start_date: subInfo.subscriptionStartDate,
    subscriptionEndDate: subInfo.subscriptionEndDate,
    subscription_end_date: subInfo.subscriptionEndDate,
    subscriptionStatus: subInfo.subscriptionStatus,
    subscription_status: subInfo.subscriptionStatus,
    daysRemaining: subInfo.daysRemaining,
    pendingRenewalRequest: subInfo.pendingRenewalRequest,
    subscriptionInfo: subInfo,
    themeColor: tenantRow?.theme_color || '#2563EB',
    backgroundColor: tenantRow?.background_color || '#ffffff',
    isOnboarded: tenantRow ? Boolean(tenantRow.is_onboarded) : true,
    name: s.name,
    companyName: s.name,
    company_name: s.name,
    phone: s.phone || '',
    companyPhone: s.phone || '',
    company_phone: s.phone || '',
    email: s.email || '',
    companyEmail: s.email || '',
    company_email: s.email || '',
    address: s.address || '',
    companyAddress: s.address || '',
    company_address: s.address || '',
    strn: s.strn || '',
    taxId: s.tax_id || s.tax_number || '',
    tax_id: s.tax_id || s.tax_number || '',
    taxNumber: s.tax_number || s.tax_id || '',
    tax_number: s.tax_number || s.tax_id || '',
    website: s.website || '',
    logo,
    receiptLogo,
    receipt_logo: receiptLogo,
    showReceiptLogo,
    show_receipt_logo: showReceiptLogo,
    currency: s.currency || 'PKR',
    currencyName: s.currency_name || 'Pakistani Rupee',
    currency_name: s.currency_name || 'Pakistani Rupee',
    currencySymbol: s.currency_symbol || 'Rs.',
    currency_symbol: s.currency_symbol || 'Rs.',
    invoicePrefix: s.invoice_prefix || 'INV-',
    invoice_prefix: s.invoice_prefix || 'INV-',
    purchasePrefix: s.purchase_prefix || 'PUR-',
    purchase_prefix: s.purchase_prefix || 'PUR-',
    barcodePrefix: s.barcode_prefix || '0108923',
    barcode_prefix: s.barcode_prefix || '0108923',
    invoiceFooter: s.invoice_footer || '',
    invoice_footer: s.invoice_footer || '',
    lowStockLimit: s.low_stock_limit,
    pricingPolicy: mode,
    pricing_policy: mode,
    pricingMode: mode,
    pricing_mode: mode,
    pricingPolicyLocked: locked,
    pricing_policy_locked: locked,
    isInstalled: Boolean(s.is_installed),
    is_installed: Boolean(s.is_installed),
    updatedAt: s.updated_at,
  };
}

// GET /api/settings/subscription - Dedicated endpoint to fetch populated subscriptionInfo and appKey for active store
router.get('/subscription', async (req: Request, res: Response) => {
  try {
    await ensureSettingsPricingColumns();
    const tenantId = await resolvePublicOrAuthTenantId(req);
    const tenantRow = await ensureTenantSubscriptionPopulated(tenantId);
    const pendingRenewal = await getPendingRenewalRequest(tenantRow?.id || tenantId, tenantRow?.slug);
    const subscriptionInfo = buildSubscriptionInfo(tenantRow, pendingRenewal);
    return res.json({
      tenantId: tenantRow?.id || tenantId,
      slug: tenantRow?.slug || 'tj-shoes',
      storeName: tenantRow?.name || 'TJ Shoes Flagship',
      appKey: subscriptionInfo.appKey,
      pendingRenewalRequest: pendingRenewal,
      subscriptionInfo,
    });
  } catch (err: any) {
    const fallbackSub = buildSubscriptionInfo(null, null);
    return res.status(200).json({
      tenantId: 1,
      slug: 'tj-shoes',
      storeName: 'TJ Shoes Flagship',
      appKey: fallbackSub.appKey,
      pendingRenewalRequest: null,
      subscriptionInfo: fallbackSub,
    });
  }
});

// POST /api/settings/renew-subscription - Store Owner triggers a subscription extension request to SuperAdmin
router.post('/renew-subscription', async (req: Request, res: Response) => {
  try {
    await ensureSettingsPricingColumns();
    const tenantId = await resolvePublicOrAuthTenantId(req);
    const tenantRow = await ensureTenantSubscriptionPopulated(tenantId);

    if (!tenantRow) {
      return res.status(404).json({ error: 'Store tenant not found.' });
    }

    const csRes = await pgClient
      .query('SELECT name, email, phone, address FROM company_settings WHERE tenant_id = $1 LIMIT 1', [tenantRow.id])
      .catch(() => ({ rows: [] as any[] }));
    const cs = csRes.rows[0] || {};

    const requestedPlan = normalizeSubscriptionPlan(
      req.body?.plan || req.body?.subscriptionPlan || tenantRow.subscription_plan || 'YEARLY'
    );
    const planLabel = requestedPlan === '6_MONTHS' ? '6 Months' : 'Yearly (12 Months)';
    const customNote = String(req.body?.notes || req.body?.message || '').trim();
    const fullNotes = customNote
      ? `[RENEWAL REQUEST • ${planLabel} • Key: ${tenantRow.app_key || 'N/A'}] ${customNote}`
      : `Subscription renewal/extension request (${planLabel}) for store ${tenantRow.name} (${tenantRow.slug}.mypos.com) • App Key: ${tenantRow.app_key || 'N/A'}`;

    const storeName = String(cs.name || tenantRow.name || tenantRow.slug).trim();
    const ownerName = String(tenantRow.owner_name || `${storeName} Owner`).trim();
    const ownerEmail = String(tenantRow.owner_email || cs.email || `admin@${tenantRow.slug}.mypos.com`).trim().toLowerCase();
    const ownerPhone = String(tenantRow.owner_phone || cs.phone || '').trim();
    const businessAddress = String(tenantRow.business_address || tenantRow.address || cs.address || '').trim();

    await pgClient.exec(`
      ALTER TABLE store_requests ADD COLUMN IF NOT EXISTS request_type TEXT NOT NULL DEFAULT 'NEW_STORE';
      ALTER TABLE store_requests ADD COLUMN IF NOT EXISTS notes TEXT DEFAULT '';
      ALTER TABLE store_requests ADD COLUMN IF NOT EXISTS provisioned_tenant_id INTEGER;
    `).catch(() => {});

    // Clear any prior deletion tombstone for this store slug when a new renewal request is submitted
    await pgClient
      .query('DELETE FROM deleted_store_requests WHERE LOWER(requested_slug) = LOWER($1)', [tenantRow.slug])
      .catch(() => {});

    // Check if a PENDING renewal request already exists for this store
    const existingPending = await pgClient.query<any>(
      `SELECT * FROM store_requests
       WHERE status = 'PENDING'
         AND (provisioned_tenant_id = $1 OR LOWER(requested_slug) = LOWER($2))
       ORDER BY id DESC
       LIMIT 1`,
      [tenantRow.id, tenantRow.slug]
    );

    let renewalRow: any;
    if (existingPending.rows.length > 0) {
      const updatedReq = await pgClient.query<any>(
        `UPDATE store_requests
         SET plan = $1,
             request_type = 'RENEWAL',
             notes = $2,
             provisioned_tenant_id = $3,
             store_name = $4,
             owner_name = $5,
             owner_email = $6,
             owner_phone = $7,
             updated_at = NOW()
         WHERE id = $8
         RETURNING *`,
        [
          requestedPlan,
          fullNotes,
          tenantRow.id,
          storeName,
          ownerName,
          ownerEmail,
          ownerPhone,
          existingPending.rows[0].id,
        ]
      );
      renewalRow = updatedReq.rows[0];
    } else {
      const insertedReq = await pgClient.query<any>(
        `INSERT INTO store_requests (
           store_name, requested_slug, owner_name, owner_email, owner_phone,
           business_address, plan, request_type, notes, status, provisioned_tenant_id, created_at, updated_at
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'RENEWAL', $8, 'PENDING', $9, NOW(), NOW())
         RETURNING *`,
        [
          storeName,
          tenantRow.slug,
          ownerName,
          ownerEmail,
          ownerPhone,
          businessAddress,
          requestedPlan,
          fullNotes,
          tenantRow.id,
        ]
      );
      renewalRow = insertedReq.rows[0];
    }

    const subscriptionInfo = buildSubscriptionInfo(tenantRow, renewalRow);
    return res.status(201).json({
      success: true,
      renewalRequest: renewalRow,
      subscriptionInfo,
      message: `Subscription extension request (${planLabel}) for '${storeName}' has been sent to the SuperAdmin for approval.`,
    });
  } catch (err: any) {
    return res.status(500).json({
      error: 'Failed to submit subscription renewal request: ' + (err?.message || 'Unknown error'),
    });
  }
});

// GET /api/settings - Public or Authenticated to get company settings for the active tenant
router.get('/', async (req: Request, res: Response) => {
  try {
    await ensureSettingsPricingColumns();
    const tenantId = await resolvePublicOrAuthTenantId(req);

    const [result, tenantRow] = await Promise.all([
      pgClient.query('SELECT * FROM company_settings WHERE tenant_id = $1 LIMIT 1', [tenantId]),
      ensureTenantSubscriptionPopulated(tenantId),
    ]);
    const pendingRenewal = await getPendingRenewalRequest(tenantRow?.id || tenantId, tenantRow?.slug);

    if (result.rows.length === 0) {
      const fallback = await pgClient.query('SELECT * FROM company_settings ORDER BY id ASC LIMIT 1');
      if (fallback.rows.length === 0) {
        return res.status(404).json({ error: 'Company settings not initialized.' });
      }
      return res.json({
        settings: formatSettingsResponse(fallback.rows[0], tenantRow, pendingRenewal),
      });
    }

    const s: any = result.rows[0];
    res.json({
      settings: formatSettingsResponse(s, tenantRow, pendingRenewal),
    });
  } catch (err: any) {
    const fallbackSub = buildSubscriptionInfo(null);
    res.status(200).json({
      settings: {
        id: 0,
        tenantId: 1,
        slug: 'tj-shoes',
        appKey: fallbackSub.appKey,
        app_key: fallbackSub.appKey,
        subscriptionPlan: fallbackSub.subscriptionPlan,
        subscription_plan: fallbackSub.subscriptionPlan,
        subscriptionStartDate: fallbackSub.subscriptionStartDate,
        subscription_start_date: fallbackSub.subscriptionStartDate,
        subscriptionEndDate: fallbackSub.subscriptionEndDate,
        subscription_end_date: fallbackSub.subscriptionEndDate,
        subscriptionStatus: fallbackSub.subscriptionStatus,
        subscription_status: fallbackSub.subscriptionStatus,
        daysRemaining: fallbackSub.daysRemaining,
        subscriptionInfo: fallbackSub,
        name: 'TJ Shoes Flagship',
        companyName: 'TJ Shoes Flagship',
        company_name: 'TJ Shoes Flagship',
        phone: '',
        companyPhone: '',
        email: '',
        companyEmail: '',
        address: '',
        companyAddress: '',
        currency: 'PKR',
        currencyName: 'Pakistani Rupee',
        currency_name: 'Pakistani Rupee',
        currencySymbol: 'Rs.',
        currency_symbol: 'Rs.',
        invoicePrefix: 'INV-',
        invoice_prefix: 'INV-',
        purchasePrefix: 'PUR-',
        purchase_prefix: 'PUR-',
        barcodePrefix: '0108923',
        barcode_prefix: '0108923',
        pricingPolicy: 'FIXED',
        pricing_policy: 'FIXED',
        pricingMode: 'FIXED',
        pricing_mode: 'FIXED',
        pricingPolicyLocked: false,
        pricing_policy_locked: false,
        isInstalled: true,
        is_installed: true,
      },
    });
  }
});

// PUT /api/settings - Update Company Settings (Admin Only, Strictly scoped to req.user.tenantId)
router.put('/', requireAuth, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    await ensureSettingsPricingColumns();
    const tenantId = extractStrictTenantId(req);

    const companyName = (req.body.company_name || req.body.companyName || req.body.name || '').trim();
    const companyPhone = (req.body.company_phone || req.body.companyPhone || req.body.phone || '').trim();
    const companyEmail = (req.body.company_email || req.body.companyEmail || req.body.email || '').trim();
    const companyAddress = (req.body.company_address || req.body.companyAddress || req.body.address || '').trim();
    const strn = (req.body.strn || '').trim();
    const taxId = (req.body.tax_id || req.body.taxId || req.body.taxNumber || req.body.tax_number || '').trim();
    const website = (req.body.website || '').trim();

    const currencyName = (req.body.currency_name || req.body.currencyName || 'Pakistani Rupee').trim();
    const currencySymbol = (req.body.currency_symbol || req.body.currencySymbol || 'Rs.').trim();
    const barcodePrefix = (req.body.barcode_prefix || req.body.barcodePrefix || '').trim();
    const purchasePrefix = (req.body.purchase_prefix || req.body.purchasePrefix || 'PO-').trim();
    const invoicePrefix = (req.body.invoice_prefix || req.body.invoicePrefix || 'INV-').trim();

    const logo = req.body.logo || '';
    const receiptLogo = req.body.receipt_logo ?? req.body.receiptLogo ?? logo;
    const showReceiptLogo = Boolean(req.body.show_receipt_logo ?? req.body.showReceiptLogo ?? false);
    const invoiceFooter = req.body.invoice_footer || req.body.invoiceFooter || '';
    const lowStockLimit = parseInt(req.body.low_stock_limit || req.body.lowStockLimit, 10) || 5;

    const currentSettingsRes = await pgClient.query<{
      id: number;
      is_installed: boolean;
      pricing_policy_locked: boolean;
      pricing_mode: string;
    }>('SELECT id, is_installed, pricing_policy_locked, pricing_mode FROM company_settings WHERE tenant_id = $1 LIMIT 1', [tenantId]);

    const currentRow = currentSettingsRes.rows[0];
    let pricingMode = String(currentRow?.pricing_mode || 'FIXED').toUpperCase() === 'NEGOTIABLE' ? 'NEGOTIABLE' : 'FIXED';

    const requestedMode = req.body.pricingPolicy || req.body.pricing_policy || req.body.pricing_mode || req.body.pricingMode;
    if (requestedMode) {
      pricingMode = String(requestedMode).toUpperCase() === 'NEGOTIABLE' ? 'NEGOTIABLE' : 'FIXED';
    }

    const currencyCode = req.body.currency || 'PKR';

    if (!companyName) {
      return res.status(400).json({ error: 'company_name is required.' });
    }
    if (!companyPhone) {
      return res.status(400).json({ error: 'company_phone is required.' });
    }
    if (companyEmail) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(companyEmail)) {
        return res.status(400).json({ error: 'company_email must be in a valid email format (e.g., info@company.com).' });
      }
    }

    if (!currencyName) {
      return res.status(400).json({ error: 'currency_name is required (e.g., "Pakistani Rupee", "US Dollar").' });
    }
    if (!currencySymbol) {
      return res.status(400).json({ error: 'currency_symbol is required (e.g., "Rs.", "$", "PKR").' });
    }
    if (!/^\d{7}$/.test(barcodePrefix)) {
      return res.status(400).json({
        error: 'barcode_prefix must be strictly 7 numeric digits (e.g., 0108923 or 2000001).',
      });
    }
    if (!purchasePrefix) {
      return res.status(400).json({ error: 'purchase_prefix is required (e.g., "PO-").' });
    }
    if (!invoicePrefix) {
      return res.status(400).json({ error: 'invoice_prefix is required (e.g., "INV-").' });
    }

    let updateRes;
    if (currentRow) {
      updateRes = await pgClient.query(
        `UPDATE company_settings SET
           name = $1, phone = $2, email = $3, address = $4,
           strn = $5, tax_id = $6, tax_number = $6, website = $7, logo = $8,
           currency_name = $9, currency = $10, currency_symbol = $11,
           barcode_prefix = $12, purchase_prefix = $13, invoice_prefix = $14,
           invoice_footer = $15, low_stock_limit = $16,
           pricing_mode = $17, pricing_policy_locked = false, show_receipt_logo = $18, receipt_logo = $19, updated_at = NOW()
         WHERE id = $20 AND tenant_id = $21
         RETURNING *`,
        [
          companyName,
          companyPhone,
          companyEmail,
          companyAddress,
          strn,
          taxId,
          website,
          logo,
          currencyName,
          currencyCode,
          currencySymbol,
          barcodePrefix,
          purchasePrefix,
          invoicePrefix,
          invoiceFooter,
          lowStockLimit,
          pricingMode,
          showReceiptLogo,
          receiptLogo,
          currentRow.id,
          tenantId,
        ]
      );
    } else {
      updateRes = await pgClient.query(
        `INSERT INTO company_settings (
           tenant_id, name, phone, email, address, strn, tax_id, tax_number, website, logo,
           currency_name, currency, currency_symbol, barcode_prefix, purchase_prefix, invoice_prefix,
           invoice_footer, low_stock_limit, pricing_mode, pricing_policy_locked, show_receipt_logo, receipt_logo, is_installed
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, false, $19, $20, true)
         RETURNING *`,
        [
          tenantId,
          companyName,
          companyPhone,
          companyEmail,
          companyAddress,
          strn,
          taxId,
          website,
          logo,
          currencyName,
          currencyCode,
          currencySymbol,
          barcodePrefix,
          purchasePrefix,
          invoicePrefix,
          invoiceFooter,
          lowStockLimit,
          pricingMode,
          showReceiptLogo,
          receiptLogo,
        ]
      );
    }

    // Sync tenant metadata
    await pgClient
      .query(
        `UPDATE tenants SET
           name = $1, logo_url = CASE WHEN $2 != '' THEN $2 ELSE logo_url END,
           business_address = $3, tax_id = $4, currency = $5, currency_symbol = $6, updated_at = NOW()
         WHERE id = $7`,
        [companyName, logo, companyAddress, taxId, currencyCode, currencySymbol, tenantId]
      )
      .catch(() => {});

    const populatedTenantRow = await ensureTenantSubscriptionPopulated(tenantId);

    const s: any = updateRes.rows[0];
    res.json({
      message: 'Company settings updated successfully.',
      settings: formatSettingsResponse(s, populatedTenantRow),
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to update settings: ' + err.message });
  }
});

// --- USER MANAGEMENT (Admin Only, Strictly scoped to req.user.tenantId) ---

router.get('/users', requireAuth, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = extractStrictTenantId(req);
    const result = await pgClient.query(
      "SELECT id, tenant_id, name, email, phone, avatar_url, role, status, created_at, updated_at FROM users WHERE tenant_id = $1 AND role != 'SUPERADMIN' ORDER BY id ASC",
      [tenantId]
    );
    res.json({ users: result.rows });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to fetch users: ' + err.message });
  }
});

router.put('/users/:id/status', requireAuth, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = extractStrictTenantId(req);
    const targetUserId = parseInt(req.params.id, 10);
    const { status } = req.body;

    if (!['APPROVED', 'PENDING'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status. Must be APPROVED or PENDING.' });
    }

    if (targetUserId === req.user!.id && status === 'PENDING') {
      return res.status(400).json({ error: 'You cannot revoke your own account approval.' });
    }

    const result = await pgClient.query(
      'UPDATE users SET status = $1, updated_at = NOW() WHERE id = $2 AND tenant_id = $3 RETURNING id, name, email, role, status',
      [status, targetUserId, tenantId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found in your store.' });
    }

    const updatedUser: any = result.rows[0];
    res.json({
      message: `User ${updatedUser.name} has been ${status === 'APPROVED' ? 'APPROVED' : 'marked PENDING'}.`,
      user: updatedUser,
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to update user status: ' + err.message });
  }
});

router.put('/users/:id/role', requireAuth, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = extractStrictTenantId(req);
    const targetUserId = parseInt(req.params.id, 10);
    const { role } = req.body;

    if (!['ADMIN', 'CASHIER'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role. Must be ADMIN or CASHIER.' });
    }

    if (targetUserId === req.user!.id && role !== 'ADMIN') {
      return res.status(400).json({ error: 'You cannot remove your own Admin permissions.' });
    }

    const result = await pgClient.query(
      'UPDATE users SET role = $1, updated_at = NOW() WHERE id = $2 AND tenant_id = $3 RETURNING id, name, email, role, status',
      [role, targetUserId, tenantId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found in your store.' });
    }

    res.json({
      message: `User role updated to ${role}.`,
      user: result.rows[0],
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to update user role: ' + err.message });
  }
});

router.post('/users', requireAuth, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = extractStrictTenantId(req);
    const { name, email, password, phone, role, status } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Full name is required.' });
    }
    if (!email || !email.trim()) {
      return res.status(400).json({ error: 'Email address is required.' });
    }
    if (!password || password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters long.' });
    }

    const confirmPassword = req.body.confirmPassword || req.body.confirm_password;
    if (confirmPassword !== undefined && password !== confirmPassword) {
      return res.status(400).json({ error: 'Passwords do not match.' });
    }

    const assignedRole = (role || 'CASHIER').toUpperCase();
    if (!['ADMIN', 'CASHIER'].includes(assignedRole)) {
      return res.status(400).json({ error: 'Invalid role. Must be ADMIN or CASHIER.' });
    }

    const initialStatus = (status || 'APPROVED').toUpperCase();
    if (!['APPROVED', 'PENDING'].includes(initialStatus)) {
      return res.status(400).json({ error: 'Invalid status. Must be APPROVED or PENDING.' });
    }

    const cleanEmail = email.trim().toLowerCase();
    const existing = await pgClient.query(
      'SELECT id FROM users WHERE LOWER(email) = $1 AND tenant_id = $2',
      [cleanEmail, tenantId]
    );
    if (existing.rows.length > 0) {
      return res.status(400).json({ error: 'An account with this email address already exists in this store.' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const cleanPhone = typeof phone === 'string' ? phone.trim() : '';

    const result = await pgClient.query(
      `INSERT INTO users (tenant_id, name, email, phone, password_hash, quick_password, role, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
       RETURNING id, tenant_id, name, email, phone, avatar_url, role, status, created_at, updated_at`,
      [tenantId, name.trim(), cleanEmail, cleanPhone, passwordHash, password, assignedRole, initialStatus]
    );

    res.status(201).json({
      message: `${assignedRole === 'ADMIN' ? 'Administrator' : 'Cashier'} account created successfully.`,
      user: result.rows[0],
    });
  } catch (err: any) {
    console.error('Create user error:', err);
    res.status(500).json({ error: 'Failed to create user: ' + err.message });
  }
});

router.delete('/users/:id', requireAuth, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = extractStrictTenantId(req);
    const targetUserId = parseInt(req.params.id, 10);
    if (!targetUserId || isNaN(targetUserId)) {
      return res.status(400).json({ error: 'Invalid user ID.' });
    }

    if (targetUserId === req.user!.id) {
      return res.status(400).json({ error: 'You cannot delete your own active administrator account.' });
    }

    const targetUserRes = await pgClient.query(
      'SELECT id, name, role FROM users WHERE id = $1 AND tenant_id = $2',
      [targetUserId, tenantId]
    );
    if (targetUserRes.rows.length === 0) {
      return res.status(404).json({ error: 'User not found in your store.' });
    }

    const targetUser: any = targetUserRes.rows[0];
    if (targetUser.role === 'ADMIN') {
      const adminCountRes = await pgClient.query(
        "SELECT COUNT(*) as count FROM users WHERE role = 'ADMIN' AND tenant_id = $1",
        [tenantId]
      );
      const adminCount = parseInt(adminCountRes.rows[0]?.count || '0', 10);
      if (adminCount <= 1) {
        return res.status(400).json({ error: 'Cannot delete the only remaining Administrator account in this store.' });
      }
    }

    const currentAdminId = req.user!.id;
    try {
      await pgClient.query('UPDATE sales SET created_by = $1 WHERE created_by = $2 AND tenant_id = $3', [currentAdminId, targetUserId, tenantId]);
      await pgClient.query('UPDATE sales SET overridden_by = NULL WHERE overridden_by = $1 AND tenant_id = $2', [targetUserId, tenantId]);
      await pgClient.query('UPDATE purchases SET created_by = $1 WHERE created_by = $2 AND tenant_id = $3', [currentAdminId, targetUserId, tenantId]);
      await pgClient.query('UPDATE supplier_payments SET created_by = $1 WHERE created_by = $2 AND tenant_id = $3', [currentAdminId, targetUserId, tenantId]);
      await pgClient.query('UPDATE purchase_returns SET created_by = $1 WHERE created_by = $2 AND tenant_id = $3', [currentAdminId, targetUserId, tenantId]);
      await pgClient.query('UPDATE returns SET created_by = $1 WHERE created_by = $2 AND tenant_id = $3', [currentAdminId, targetUserId, tenantId]);
      await pgClient.query('UPDATE stock_movements SET user_id = $1 WHERE user_id = $2 AND tenant_id = $3', [currentAdminId, targetUserId, tenantId]);
      await pgClient.query('DELETE FROM password_reset_tokens WHERE user_id = $1', [targetUserId]);
    } catch (reassignErr) {
      console.warn('Reassignment notice on user deletion:', reassignErr);
    }

    await pgClient.query('DELETE FROM users WHERE id = $1 AND tenant_id = $2', [targetUserId, tenantId]);

    res.json({
      message: `User account "${targetUser.name}" has been deleted successfully.`,
    });
  } catch (err: any) {
    console.error('Delete user error:', err);
    res.status(500).json({ error: 'Failed to delete user: ' + err.message });
  }
});

export default router;
