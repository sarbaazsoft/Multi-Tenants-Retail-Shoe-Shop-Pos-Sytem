import { Router } from 'express';
import type { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { pgClient } from '../../db/index.ts';
import { ensureSaasControlPlane, ensureTenantStoreUsers } from '../../db/schemaInit.ts';
import { generateToken, requireAuth } from '../auth.ts';
import type { AuthenticatedRequest, AuthUser } from '../auth.ts';
import { extractRequestStoreSubdomain } from '../middleware/tenantMiddleware.ts';

const router = Router();

// Helper to resolve tenant slug strictly from request subdomain, route param, or verified headers
async function resolveTargetTenant(req: Request): Promise<{
  id: number;
  slug: string;
  name: string;
  status: string;
  app_key?: string;
  subscription_plan?: string;
  subscription_start_date?: string;
  subscription_end_date?: string;
  subscription_status?: string;
  owner_name?: string;
  owner_email?: string;
  owner_phone?: string;
} | null> {
  await ensureSaasControlPlane();
  const subCheck = extractRequestStoreSubdomain(req);
  if (subCheck.isSpoofed) {
    throw new Error(
      `Cross-origin store spoofing blocked: Request origin store "${subCheck.originSubdomain}" does not match target store "${subCheck.claimedSlug}".`
    );
  }

  const targetSlug = subCheck.effectiveSlug;
  const rawTid =
    req.query?.tenantId ??
    req.query?.tenant_id ??
    req.body?.tenantId ??
    req.body?.tenant_id ??
    req.headers['x-tenant-id'] ??
    (req as any).tenantResolution?.tenant?.id;
  const explicitTenantId = Number(rawTid);
  const hasExplicitTenantId = Number.isInteger(explicitTenantId) && explicitTenantId > 0;

  if (targetSlug && targetSlug !== 'default' && targetSlug !== 'admin' && targetSlug !== 'superadmin') {
    const tRes = await pgClient.query<any>(
      `SELECT t.id, t.slug, t.name, t.status, t.app_key, t.subscription_plan,
              t.subscription_start_date, t.subscription_end_date, t.subscription_status,
              u.name AS owner_name, u.email AS owner_email, u.phone AS owner_phone
       FROM tenants t
       LEFT JOIN LATERAL (
         SELECT name, email, phone
         FROM users
         WHERE tenant_id = t.id AND role = 'ADMIN'
         ORDER BY id ASC
         LIMIT 1
       ) u ON true
       WHERE LOWER(t.slug) = LOWER($1)
       LIMIT 1`,
      [targetSlug]
    );
    const found = tRes.rows[0] || null;
    if (found && hasExplicitTenantId && Number(found.id) !== explicitTenantId) {
      throw new Error(
        `Tenant ID mismatch: Supplied tenant_id (${explicitTenantId}) does not match store subdomain "${targetSlug}" (tenant_id ${found.id}).`
      );
    }
    return found;
  }

  if (hasExplicitTenantId) {
    const byIdRes = await pgClient.query<any>(
      `SELECT t.id, t.slug, t.name, t.status, t.app_key, t.subscription_plan,
              t.subscription_start_date, t.subscription_end_date, t.subscription_status,
              u.name AS owner_name, u.email AS owner_email, u.phone AS owner_phone
       FROM tenants t
       LEFT JOIN LATERAL (
         SELECT name, email, phone
         FROM users
         WHERE tenant_id = t.id AND role = 'ADMIN'
         ORDER BY id ASC
         LIMIT 1
       ) u ON true
       WHERE t.id = $1
       LIMIT 1`,
      [explicitTenantId]
    );
    return byIdRes.rows[0] || null;
  }

  const defRes = await pgClient.query<any>(
    `SELECT t.id, t.slug, t.name, t.status, t.app_key, t.subscription_plan,
            t.subscription_start_date, t.subscription_end_date, t.subscription_status,
            u.name AS owner_name, u.email AS owner_email, u.phone AS owner_phone
     FROM tenants t
     LEFT JOIN LATERAL (
       SELECT name, email, phone
       FROM users
       WHERE tenant_id = t.id AND role = 'ADMIN'
       ORDER BY id ASC
       LIMIT 1
     ) u ON true
     ORDER BY t.id ASC
     LIMIT 1`
  );
  return defRes.rows[0] || null;
}

// Public Quick Store Login Credentials for active store (returns exact Owner & Cashier credentials for the target store)
const handleGetStoreCredentials = async (req: Request, res: Response) => {
  try {
    const tenant = await resolveTargetTenant(req);
    if (!tenant) {
      return res.status(404).json({ error: 'Store tenant not found.' });
    }

    const creds = await ensureTenantStoreUsers({
      tenantId: tenant.id,
      slug: tenant.slug,
      storeName: tenant.name,
      ownerEmail: tenant.owner_email,
      ownerPhone: tenant.owner_phone,
      createCashier: false,
    });

    res.setHeader('X-Store-Subdomain', tenant.slug);
    return res.json({
      tenant: {
        id: tenant.id,
        slug: tenant.slug,
        name: tenant.name,
        status: tenant.status,
        appKey: tenant.app_key || '',
        subscriptionPlan: tenant.subscription_plan || 'YEARLY',
        subscriptionStartDate: tenant.subscription_start_date || '',
        subscriptionEndDate: tenant.subscription_end_date || '',
        subscriptionStatus: tenant.subscription_status || 'ACTIVE',
      },
      owner: creds.owner,
      cashier: creds.cashier,
    });
  } catch (err: any) {
    return res.status(403).json({ error: 'Failed to load store credentials: ' + err.message });
  }
};
router.get('/store-credentials', handleGetStoreCredentials);
router.get('/store/credentials', handleGetStoreCredentials);
router.get('/store/:slug/credentials', handleGetStoreCredentials);

/**
 * Core Store Cashier & Owner Authentication Handler:
 * - Authenticates cross-origin API login requests strictly using the specific store's subdomain/slug.
 * - Blocks login spoofing when Origin/Referer subdomain conflicts with claimed store slug.
 * - Isolates user lookup strictly to `tenant_id = tenant.id` so if Store 1 and Store 2 have identical
 *   email/password credentials (either deliberately or via attack), Store 2 only ever authenticates Store 2's user.
 */
async function handleStoreOrPlatformLogin(req: Request, res: Response, requireStoreSubdomain: boolean) {
  try {
    await ensureSaasControlPlane();
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    const subCheck = extractRequestStoreSubdomain(req);
    if (subCheck.isSpoofed) {
      return res.status(403).json({
        error: `Security Alert: Cross-origin login spoofing blocked. Request origin store "${subCheck.originSubdomain}" does not match target store "${subCheck.claimedSlug}".`,
        code: 'STORE_LOGIN_SPOOFING_BLOCKED',
      });
    }

    const requestedSlug = subCheck.effectiveSlug;
    const rawTid =
      req.query?.tenantId ??
      req.query?.tenant_id ??
      req.body?.tenantId ??
      req.body?.tenant_id ??
      req.headers['x-tenant-id'] ??
      (req as any).tenantResolution?.tenant?.id;
    const explicitTenantId = Number(rawTid);
    const hasExplicitTenantId = Number.isInteger(explicitTenantId) && explicitTenantId > 0;

    if (
      requireStoreSubdomain &&
      (!requestedSlug || requestedSlug === 'admin' || requestedSlug === 'superadmin') &&
      !hasExplicitTenantId
    ) {
      return res.status(400).json({
        error: 'Store subdomain and tenant_id are required to authenticate a store cashier or owner.',
        code: 'STORE_SUBDOMAIN_REQUIRED',
      });
    }

    let matchedUser: any = null;
    let resolvedTenantRow: any = null;

    // 1. If a store subdomain/slug or explicit tenant_id is present, strictly authenticate against that store's tenant_id!
    if ((requestedSlug && requestedSlug !== 'admin' && requestedSlug !== 'superadmin') || hasExplicitTenantId) {
      const tenantRes =
        requestedSlug && requestedSlug !== 'admin' && requestedSlug !== 'superadmin'
          ? await pgClient.query<any>(
              'SELECT id, slug, name, status, onboarding_completed, app_key, subscription_plan, subscription_start_date, subscription_end_date, subscription_status FROM tenants WHERE LOWER(slug) = LOWER($1) LIMIT 1',
              [requestedSlug]
            )
          : await pgClient.query<any>(
              'SELECT id, slug, name, status, onboarding_completed, app_key, subscription_plan, subscription_start_date, subscription_end_date, subscription_status FROM tenants WHERE id = $1 LIMIT 1',
              [explicitTenantId]
            );
      if (tenantRes.rows.length === 0) {
        return res.status(404).json({
          error: `The target store does not exist or has been removed.`,
          code: 'TENANT_NOT_FOUND',
        });
      }

      const tenant = tenantRes.rows[0];
      resolvedTenantRow = tenant;

      // Cross-verify supplied tenant_id against the store subdomain's tenant.id to stop spoofing
      if (hasExplicitTenantId && Number(tenant.id) !== explicitTenantId) {
        return res.status(403).json({
          error: `Security Alert: Supplied tenant_id (${explicitTenantId}) does not match store "${tenant.slug}" (tenant_id ${tenant.id}).`,
          code: 'TENANT_ID_SPOOFING_BLOCKED',
        });
      }

      const verifiedTenantId = Number(tenant.id);

      const isExpiredByDate =
        tenant.subscription_end_date && new Date(tenant.subscription_end_date).getTime() < Date.now();
      const isMarkedExpired =
        String(tenant.subscription_status || '').toUpperCase() === 'EXPIRED' ||
        String(tenant.status || '').toUpperCase() === 'EXPIRED';

      if (isExpiredByDate || isMarkedExpired) {
        if (String(tenant.subscription_status || '').toUpperCase() !== 'EXPIRED') {
          await pgClient
            .query(
              `UPDATE tenants SET subscription_status = 'EXPIRED', updated_at = NOW() WHERE id = $1`,
              [verifiedTenantId]
            )
            .catch(() => {});
        }
      }

      if (
        String(tenant.status).toUpperCase() === 'SUSPENDED' ||
        String(tenant.subscription_status || '').toUpperCase() === 'SUSPENDED'
      ) {
        return res.status(423).json({
          error: `Store Suspended: "${tenant.name}" is currently suspended by platform administration.`,
          code: 'TENANT_SUSPENDED',
        });
      }

      // Strictly query users belonging ONLY to this specific store (WHERE tenant_id = $2 AND LOWER(email) = LOWER($1))
      // Even if Store 1 and Store 2 share identical email & password, only Store 2's rows (with tenant_id = verifiedTenantId) are inspected.
      const storeUsersRes = await pgClient.query(
        `SELECT id, tenant_id, name, email, phone, avatar_url, password_hash, role, status
         FROM users
         WHERE COALESCE(tenant_id, 1) = $2 AND LOWER(email) = LOWER($1)
         ORDER BY CASE WHEN role = 'ADMIN' THEN 0 ELSE 1 END, id ASC`,
        [email.trim(), verifiedTenantId]
      );

      for (const candidate of storeUsersRes.rows) {
        if (Number(candidate.tenant_id) !== verifiedTenantId) continue;
        const isMatch = await bcrypt.compare(password, candidate.password_hash);
        if (isMatch) {
          matchedUser = candidate;
          break;
        }
      }

      // Only if no store user matched in this tenant, check if global SUPERADMIN is logging in
      if (!matchedUser) {
        const saRes = await pgClient.query(
          `SELECT id, tenant_id, name, email, phone, avatar_url, password_hash, role, status
           FROM users
           WHERE role = 'SUPERADMIN' AND LOWER(email) = LOWER($1)
           ORDER BY id ASC
           LIMIT 1`,
          [email.trim()]
        );
        if (saRes.rows.length > 0) {
          const saCandidate = saRes.rows[0];
          if (await bcrypt.compare(password, saCandidate.password_hash)) {
            matchedUser = saCandidate;
          }
        }
      }

      if (!matchedUser) {
        return res.status(401).json({
          error: `Invalid email or password for store "${tenant.name}" (${tenant.slug}).`,
        });
      }
    } else {
      // 2. Platform / SuperAdmin login (when not on a specific store subdomain)
      const candidatesRes = await pgClient.query(
        `SELECT id, tenant_id, name, email, phone, avatar_url, password_hash, role, status
         FROM users
         WHERE LOWER(email) = LOWER($1)
         ORDER BY CASE WHEN role = 'SUPERADMIN' THEN 0 ELSE 1 END, id ASC`,
        [email.trim()]
      );

      for (const candidate of candidatesRes.rows) {
        if (await bcrypt.compare(password, candidate.password_hash)) {
          matchedUser = candidate;
          break;
        }
      }

      if (!matchedUser) {
        return res.status(401).json({ error: 'Invalid email or password.' });
      }
    }

    const user: any = matchedUser;

    if (user.status === 'PENDING') {
      return res.status(423).json({
        error: 'Your account is currently PENDING approval by the Shop Owner/Admin.',
        status: 'PENDING',
      });
    }

    const parsedTid = Number(user.tenant_id);
    const isSuperAdminRole = String(user.role).toUpperCase() === 'SUPERADMIN';
    const isStoreAdminRole = String(user.role).toUpperCase() === 'ADMIN';
    const tenantId =
      !isSuperAdminRole && resolvedTenantRow?.id
        ? Number(resolvedTenantRow.id)
        : Number.isInteger(parsedTid) && parsedTid > 0
        ? parsedTid
        : 1;

    // Extra safeguard: for non-SuperAdmin store login, user.tenant_id MUST equal resolvedTenantRow.id
    if (!isSuperAdminRole && resolvedTenantRow && Number(user.tenant_id) !== Number(resolvedTenantRow.id)) {
      return res.status(403).json({
        error: 'Store authentication mismatch: Credentials do not belong to this store subdomain.',
        code: 'CROSS_STORE_LOGIN_DENIED',
      });
    }

    let tenantSlug = isSuperAdminRole ? 'admin' : resolvedTenantRow?.slug || requestedSlug || '';
    let tenantName = isSuperAdminRole ? 'POS SaaS C-Panel' : resolvedTenantRow?.name || 'Retail Store';
    let onboardingCompleted = resolvedTenantRow ? Boolean(resolvedTenantRow.onboarding_completed) : true;
    let subscriptionStatus = resolvedTenantRow
      ? String(resolvedTenantRow.subscription_status || 'ACTIVE').toUpperCase()
      : 'ACTIVE';

    if (!isSuperAdminRole) {
      const t =
        resolvedTenantRow ||
        (
          await pgClient.query<any>(
            'SELECT id, slug, name, status, onboarding_completed, subscription_end_date, subscription_status FROM tenants WHERE id = $1 LIMIT 1',
            [tenantId]
          )
        ).rows[0];

      if (t) {
        tenantSlug = t.slug;
        tenantName = t.name;
        onboardingCompleted = Boolean(t.onboarding_completed);
        subscriptionStatus = String(t.subscription_status || 'ACTIVE').toUpperCase();

        const isExpiredByDate =
          t.subscription_end_date && new Date(t.subscription_end_date).getTime() < Date.now();
        const isMarkedExpired =
          subscriptionStatus === 'EXPIRED' || String(t.status || '').toUpperCase() === 'EXPIRED';

        if (isExpiredByDate || isMarkedExpired) {
          subscriptionStatus = 'EXPIRED';
          if (String(t.subscription_status || '').toUpperCase() !== 'EXPIRED') {
            await pgClient
              .query(
                `UPDATE tenants SET subscription_status = 'EXPIRED', updated_at = NOW() WHERE id = $1`,
                [t.id]
              )
              .catch(() => {});
          }
          // Cashiers are blocked when expired; Store Owners (ADMIN) can log in to SettingsView to renew subscription
          if (!isStoreAdminRole) {
            return res.status(403).json({
              error: 'Your subscription key has expired. Please contact support to renew.',
              code: 'SUBSCRIPTION_EXPIRED',
            });
          }
        }

        if (
          String(t.status).toUpperCase() === 'SUSPENDED' ||
          String(t.subscription_status || '').toUpperCase() === 'SUSPENDED'
        ) {
          return res.status(423).json({
            error: `Store Suspended: "${t.name}" is currently suspended by platform administration.`,
            code: 'TENANT_SUSPENDED',
          });
        }
      }
    }

    const authUser = {
      id: user.id,
      tenantId,
      slug: tenantSlug,
      storeSubdomain: tenantSlug,
      tenantName,
      name: user.name,
      email: user.email,
      phone: user.phone || '',
      avatarUrl: user.avatar_url || '',
      role: user.role,
      originalRole: user.role,
      status: user.status,
      onboardingCompleted,
      subscriptionStatus,
    };

    const token = generateToken(authUser);
    if (tenantSlug) {
      res.setHeader('X-Store-Subdomain', tenantSlug);
      res.setHeader('X-Tenant-Slug', tenantSlug);
    }
    return res.json({ token, user: authUser });
  } catch (err: any) {
    console.error('Login error:', err);
    return res.status(500).json({ error: 'Login failed: ' + err.message });
  }
}

// Dedicated Store Cashier & Owner Auth Routes (strictly bound to specific store subdomain)
router.post('/store/:slug/login', (req: Request, res: Response) =>
  handleStoreOrPlatformLogin(req, res, true)
);
router.post('/store/login', (req: Request, res: Response) =>
  handleStoreOrPlatformLogin(req, res, true)
);

// General Login Route (automatically enforces store subdomain isolation when called from a store)
router.post('/login', (req: Request, res: Response) =>
  handleStoreOrPlatformLogin(req, res, false)
);

// Register (supports /register, /store/register, /store/:slug/register)
const handleStoreRegister = async (req: Request, res: Response) => {
  try {
    const { name, email, password, phone } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Name, email, and password are required.' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters long.' });
    }

    const confirmPassword = req.body.confirmPassword || req.body.confirm_password;
    if (confirmPassword !== undefined && password !== confirmPassword) {
      return res.status(400).json({ error: 'Passwords do not match.' });
    }

    const targetTenant = await resolveTargetTenant(req);
    const tenantId = targetTenant?.id || 1;

    const existing = await pgClient.query(
      'SELECT id FROM users WHERE LOWER(email) = LOWER($1) AND tenant_id = $2',
      [email.trim(), tenantId]
    );
    if (existing.rows.length > 0) {
      return res.status(400).json({ error: 'An account with this email already exists in this store.' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const userPhone = typeof phone === 'string' ? phone.trim() : '';

    const result = await pgClient.query(
      `INSERT INTO users (tenant_id, name, email, phone, password_hash, quick_password, role, status) 
       VALUES ($1, $2, $3, $4, $5, $6, 'CASHIER', 'PENDING') 
       RETURNING id, tenant_id, name, email, phone, role, status`,
      [tenantId, name.trim(), email.trim(), userPhone, passwordHash, password]
    );

    res.status(201).json({
      message: 'Registration submitted successfully. Your account is pending Admin approval before you can log in.',
      user: result.rows[0],
    });
  } catch (err: any) {
    console.error('Registration error:', err);
    res.status(500).json({ error: 'Registration failed: ' + err.message });
  }
};
router.post('/register', handleStoreRegister);
router.post('/store/register', handleStoreRegister);
router.post('/store/:slug/register', handleStoreRegister);

// Get current user profile
router.get('/me', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userTenantId = Number(req.user!.tenantId) > 0 ? Number(req.user!.tenantId) : 1;
    const userRes = await pgClient.query(
      `SELECT id, tenant_id, name, email, phone, avatar_url, role, status
       FROM users
       WHERE id = $1 AND (UPPER(role) = 'SUPERADMIN' OR COALESCE(tenant_id, 1) = $2)`,
      [req.user!.id, userTenantId]
    );
    if (userRes.rows.length === 0) {
      return res.status(404).json({ error: 'User not found.' });
    }
    const row: any = userRes.rows[0];
    const rowTid = Number(row.tenant_id);
    const effectiveTid = req.user!.tenantId || (Number.isInteger(rowTid) && rowTid > 0 ? rowTid : 1);
    let onboardingCompleted = true;
    if (String(row.role).toUpperCase() !== 'SUPERADMIN') {
      const tRes = await pgClient.query<{ onboarding_completed: boolean }>(
        'SELECT onboarding_completed FROM tenants WHERE id = $1 LIMIT 1',
        [effectiveTid]
      );
      if (tRes.rows.length > 0) {
        onboardingCompleted = Boolean(tRes.rows[0].onboarding_completed);
      }
    }
    res.json({
      user: {
        id: row.id,
        tenantId: effectiveTid,
        slug: req.user!.slug || '',
        name: row.name,
        email: row.email,
        phone: row.phone || '',
        avatarUrl: row.avatar_url || '',
        role: row.role,
        originalRole: row.role,
        status: row.status,
        onboardingCompleted,
      },
    });
  } catch {
    res.json({ user: req.user });
  }
});

// Update Profile (Name, Phone, and optional Avatar Image; Email is strictly unchangeable)
router.put('/profile', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { name, phone, avatarUrl } = req.body;
    const userId = req.user!.id;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Name cannot be empty.' });
    }

    const trimmedName = name.trim();
    const trimmedPhone = typeof phone === 'string' ? phone.trim() : '';
    const sanitizedAvatarUrl = typeof avatarUrl === 'string' ? avatarUrl.trim() : (req.user?.avatarUrl || '');

    const userTenantId = Number(req.user!.tenantId) > 0 ? Number(req.user!.tenantId) : 1;
    const result = await pgClient.query(
      `UPDATE users
       SET name = $1, phone = $2, avatar_url = $3, updated_at = NOW()
       WHERE id = $4 AND (UPPER(role) = 'SUPERADMIN' OR COALESCE(tenant_id, 1) = $5)
       RETURNING id, tenant_id, name, email, phone, avatar_url, role, status`,
      [trimmedName, trimmedPhone, sanitizedAvatarUrl, userId, userTenantId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User account not found.' });
    }

    const row: any = result.rows[0];
    const rowTid = Number(row.tenant_id);
    const updatedUser: AuthUser = {
      id: row.id,
      tenantId: req.user!.tenantId || (Number.isInteger(rowTid) && rowTid > 0 ? rowTid : 1),
      slug: req.user!.slug || '',
      name: row.name,
      email: row.email,
      phone: row.phone || '',
      avatarUrl: row.avatar_url || '',
      role: row.role,
      status: row.status,
    };
    const token = generateToken(updatedUser);

    res.json({
      message: 'Profile updated successfully.',
      user: updatedUser,
      token,
    });
  } catch (err: any) {
    console.error('Profile update error:', err);
    res.status(500).json({ error: 'Failed to update profile: ' + err.message });
  }
});

// Change Password
router.put('/change-password', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { currentPassword, newPassword, confirmPassword } = req.body;
    const userId = req.user!.id;

    if (!currentPassword) {
      return res.status(400).json({ error: 'Please enter your current/previous password.' });
    }

    if (!newPassword || !confirmPassword) {
      return res.status(400).json({ error: 'Please enter both new password and confirm password.' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'New password must be at least 6 characters long.' });
    }

    if (newPassword !== confirmPassword) {
      return res.status(400).json({ error: 'New password and confirm password do not match.' });
    }

    const userTenantId = Number(req.user!.tenantId) > 0 ? Number(req.user!.tenantId) : 1;
    const userRes = await pgClient.query(
      `SELECT password_hash, tenant_id, role
       FROM users
       WHERE id = $1 AND (UPPER(role) = 'SUPERADMIN' OR COALESCE(tenant_id, 1) = $2)`,
      [userId, userTenantId]
    );
    if (userRes.rows.length === 0) {
      return res.status(404).json({ error: 'User account not found in this store.' });
    }

    const user: any = userRes.rows[0];
    const isMatch = await bcrypt.compare(currentPassword, user.password_hash);
    if (!isMatch) {
      return res.status(400).json({ error: 'Incorrect previous/current password. Please check and try again.' });
    }

    const newHash = await bcrypt.hash(newPassword, 10);
    await pgClient.query(
      `UPDATE users
       SET password_hash = $1, quick_password = $2, updated_at = NOW()
       WHERE id = $3 AND (UPPER(role) = 'SUPERADMIN' OR COALESCE(tenant_id, 1) = $4)`,
      [newHash, newPassword, userId, userTenantId]
    );

    res.json({ message: 'Password changed successfully. Please remember your new password.' });
  } catch (err: any) {
    console.error('Change password error:', err);
    res.status(500).json({ error: 'Failed to change password: ' + err.message });
  }
});

// Forgot Password (strictly scoped by tenant_id when invoked from a store)
router.post('/forgot-password', async (req: Request, res: Response) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ error: 'Email is required.' });
    }

    const targetTenant = await resolveTargetTenant(req).catch(() => null);
    const resolvedTenantId = Number(targetTenant?.id || req.body?.tenantId || req.query?.tenantId || 1);

    const userRes = await pgClient.query(
      `SELECT id, name, email, tenant_id
       FROM users
       WHERE LOWER(email) = LOWER($1) AND COALESCE(tenant_id, 1) = $2
       LIMIT 1`,
      [email.trim(), resolvedTenantId]
    );
    if (userRes.rows.length === 0) {
      return res.json({
        message: 'If the email exists in our system, a password reset verification token has been issued.',
      });
    }

    const user: any = userRes.rows[0];
    const resetToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
    const userTid = Number(user.tenant_id) > 0 ? Number(user.tenant_id) : resolvedTenantId;

    await pgClient.query(
      'DELETE FROM password_reset_tokens WHERE user_id = $1 AND COALESCE(tenant_id, 1) = $2',
      [user.id, userTid]
    );

    await pgClient.query(
      'INSERT INTO password_reset_tokens (tenant_id, user_id, token, expires_at) VALUES ($1, $2, $3, $4)',
      [userTid, user.id, resetToken, expiresAt]
    );

    res.json({
      message: 'If the email exists in our system, a password reset verification token has been issued. Please enter your verification token to set a new password.',
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Forgot password failed: ' + err.message });
  }
});

// Reset Password (strictly scoped by tenant_id)
router.post('/reset-password', async (req: Request, res: Response) => {
  try {
    const { token, newPassword } = req.body;
    if (!token || !newPassword) {
      return res.status(400).json({ error: 'Reset token and new password are required.' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters long.' });
    }

    const targetTenant = await resolveTargetTenant(req).catch(() => null);
    const resolvedTenantId = Number(targetTenant?.id || req.body?.tenantId || req.query?.tenantId || 1);

    const tokenRes = await pgClient.query(
      `SELECT user_id, tenant_id, expires_at
       FROM password_reset_tokens
       WHERE token = $1 AND COALESCE(tenant_id, 1) = $2
       LIMIT 1`,
      [token, resolvedTenantId]
    );

    if (tokenRes.rows.length === 0) {
      return res.status(400).json({ error: 'Invalid or expired password reset token for this store.' });
    }

    const { user_id, tenant_id, expires_at } = tokenRes.rows[0] as any;
    const effectiveTenantId = Number(tenant_id) > 0 ? Number(tenant_id) : resolvedTenantId;

    if (new Date() > new Date(expires_at)) {
      await pgClient.query(
        'DELETE FROM password_reset_tokens WHERE token = $1 AND COALESCE(tenant_id, 1) = $2',
        [token, effectiveTenantId]
      );
      return res.status(400).json({ error: 'Password reset token has expired. Please request a new one.' });
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await pgClient.query(
      'UPDATE users SET password_hash = $1, quick_password = $2, updated_at = NOW() WHERE id = $3 AND COALESCE(tenant_id, 1) = $4',
      [passwordHash, newPassword, user_id, effectiveTenantId]
    );
    await pgClient.query(
      'DELETE FROM password_reset_tokens WHERE token = $1 AND COALESCE(tenant_id, 1) = $2',
      [token, effectiveTenantId]
    );

    res.json({ message: 'Password has been reset successfully. You may now log in with your new password.' });
  } catch (err: any) {
    res.status(500).json({ error: 'Reset password failed: ' + err.message });
  }
});

export default router;
