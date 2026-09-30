import { Router } from 'express';
import type { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { pgClient } from '../../db/index.ts';
import { ensureSaasControlPlane, ensureTenantStoreUsers } from '../../db/schemaInit.ts';
import { generateToken, requireAuth } from '../auth.ts';
import type { AuthenticatedRequest, AuthUser } from '../auth.ts';

const router = Router();

// Helper to resolve tenant slug from request headers, query, or body (for public login/register/quick-credentials endpoints)
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
  const querySlug = (req.query?.slug || req.query?.tenantSlug || '').toString().trim().toLowerCase();
  const headerSlug = (req.headers['x-tenant-slug'] as string | undefined)?.trim().toLowerCase();
  const bodySlug = (req.body?.tenantSlug || req.body?.slug || '').toString().trim().toLowerCase();
  const targetSlug = querySlug || headerSlug || bodySlug;

  if (targetSlug && targetSlug !== 'default' && targetSlug !== 'admin' && targetSlug !== 'superadmin') {
    const tRes = await pgClient.query<any>(
      'SELECT id, slug, name, status, app_key, subscription_plan, subscription_start_date, subscription_end_date, subscription_status, owner_name, owner_email, owner_phone FROM tenants WHERE LOWER(slug) = LOWER($1) LIMIT 1',
      [targetSlug]
    );
    return tRes.rows[0] || null;
  }

  const defRes = await pgClient.query<any>(
    "SELECT id, slug, name, status, app_key, subscription_plan, subscription_start_date, subscription_end_date, subscription_status, owner_name, owner_email, owner_phone FROM tenants WHERE slug = 'tj-shoes' OR id = 1 ORDER BY id ASC LIMIT 1"
  );
  return defRes.rows[0] || null;
}

// Public Quick Store Login Credentials for active store (returns exact Owner & Cashier credentials for the target store)
router.get('/store-credentials', async (req: Request, res: Response) => {
  try {
    const tenant = await resolveTargetTenant(req);
    if (!tenant) {
      return res.status(404).json({ error: 'Store tenant not found.' });
    }

    const creds = await ensureTenantStoreUsers({
      tenantId: tenant.id,
      slug: tenant.slug,
      storeName: tenant.name,
      ownerName: tenant.owner_name,
      ownerEmail: tenant.owner_email,
      ownerPhone: tenant.owner_phone,
    });

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
    return res.status(500).json({ error: 'Failed to load store credentials: ' + err.message });
  }
});

// Login (Supports Store Admin/Cashier scoped to tenant, plus SuperAdmin login)
router.post('/login', async (req: Request, res: Response) => {
  try {
    await ensureSaasControlPlane();
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    const headerSlug = (req.headers['x-tenant-slug'] as string | undefined)?.trim().toLowerCase();
    const bodySlug = (req.body?.tenantSlug || req.body?.slug || '').toString().trim().toLowerCase();
    const requestedSlug = bodySlug || headerSlug;

    // 1. Always allow global SUPERADMIN login regardless of active tenant slug or store suspension/expiry
    const superAdminCheck = await pgClient.query(
      `SELECT id, tenant_id, name, email, phone, avatar_url, password_hash, role, status
       FROM users
       WHERE LOWER(email) = LOWER($1) AND role = 'SUPERADMIN'
       LIMIT 1`,
      [email.trim()]
    );

    let result;
    if (superAdminCheck.rows.length > 0) {
      result = superAdminCheck;
    } else if (requestedSlug && requestedSlug !== 'admin' && requestedSlug !== 'superadmin') {
      const tenantRes = await pgClient.query<any>(
        'SELECT id, slug, name, status, app_key, subscription_plan, subscription_start_date, subscription_end_date, subscription_status FROM tenants WHERE LOWER(slug) = LOWER($1) LIMIT 1',
        [requestedSlug]
      );
      if (tenantRes.rows.length === 0) {
        return res.status(404).json({
          error: `The store '${requestedSlug}' does not exist or has been removed.`,
          code: 'TENANT_NOT_FOUND',
        });
      }
      const tenant = tenantRes.rows[0];
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
              [tenant.id]
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

      result = await pgClient.query(
        `SELECT id, tenant_id, name, email, phone, avatar_url, password_hash, role, status
         FROM users
         WHERE LOWER(email) = LOWER($1) AND (tenant_id = $2 OR role = 'SUPERADMIN')
         ORDER BY CASE WHEN tenant_id = $2 THEN 0 ELSE 1 END
         LIMIT 1`,
        [email.trim(), tenant.id]
      );
    } else {
      result = await pgClient.query(
        `SELECT id, tenant_id, name, email, phone, avatar_url, password_hash, role, status
         FROM users
         WHERE LOWER(email) = LOWER($1)
         ORDER BY CASE WHEN role = 'SUPERADMIN' THEN 0 ELSE 1 END, id ASC
         LIMIT 1`,
        [email.trim()]
      );
    }

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const user: any = result.rows[0];
    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    if (user.status === 'PENDING') {
      return res.status(423).json({
        error: 'Your account is currently PENDING approval by the Shop Owner/Admin.',
        status: 'PENDING',
      });
    }

    const parsedTid = Number(user.tenant_id);
    const tenantId = Number.isInteger(parsedTid) && parsedTid > 0 ? parsedTid : 1;
    const isSuperAdminRole = String(user.role).toUpperCase() === 'SUPERADMIN';
    const isStoreAdminRole = String(user.role).toUpperCase() === 'ADMIN';
    let tenantSlug = isSuperAdminRole ? 'admin' : requestedSlug || 'tj-shoes';
    let tenantName = isSuperAdminRole ? 'MyPOS SaaS C-Panel' : 'TJ Shoes';
    let onboardingCompleted = true;
    let subscriptionStatus = 'ACTIVE';

    if (!isSuperAdminRole) {
      const tLookup = await pgClient.query<any>(
        'SELECT id, slug, name, status, onboarding_completed, subscription_end_date, subscription_status FROM tenants WHERE id = $1 LIMIT 1',
        [tenantId]
      );
      if (tLookup.rows.length > 0) {
        const t = tLookup.rows[0];
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
    res.json({ token, user: authUser });
  } catch (err: any) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Login failed: ' + err.message });
  }
});

// Register
router.post('/register', async (req: Request, res: Response) => {
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
});

// Get current user profile
router.get('/me', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userRes = await pgClient.query(
      'SELECT id, tenant_id, name, email, phone, avatar_url, role, status FROM users WHERE id = $1',
      [req.user!.id]
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
        slug: req.user!.slug || 'tj-shoes',
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

    const result = await pgClient.query(
      'UPDATE users SET name = $1, phone = $2, avatar_url = $3, updated_at = NOW() WHERE id = $4 RETURNING id, tenant_id, name, email, phone, avatar_url, role, status',
      [trimmedName, trimmedPhone, sanitizedAvatarUrl, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User account not found.' });
    }

    const row: any = result.rows[0];
    const rowTid = Number(row.tenant_id);
    const updatedUser: AuthUser = {
      id: row.id,
      tenantId: req.user!.tenantId || (Number.isInteger(rowTid) && rowTid > 0 ? rowTid : 1),
      slug: req.user!.slug || 'tj-shoes',
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

    const userRes = await pgClient.query('SELECT password_hash FROM users WHERE id = $1', [userId]);
    if (userRes.rows.length === 0) {
      return res.status(404).json({ error: 'User account not found.' });
    }

    const user: any = userRes.rows[0];
    const isMatch = await bcrypt.compare(currentPassword, user.password_hash);
    if (!isMatch) {
      return res.status(400).json({ error: 'Incorrect previous/current password. Please check and try again.' });
    }

    const newHash = await bcrypt.hash(newPassword, 10);
    await pgClient.query('UPDATE users SET password_hash = $1, quick_password = $2, updated_at = NOW() WHERE id = $3', [newHash, newPassword, userId]);

    res.json({ message: 'Password changed successfully. Please remember your new password.' });
  } catch (err: any) {
    console.error('Change password error:', err);
    res.status(500).json({ error: 'Failed to change password: ' + err.message });
  }
});

// Forgot Password
router.post('/forgot-password', async (req: Request, res: Response) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ error: 'Email is required.' });
    }

    const userRes = await pgClient.query('SELECT id, name, email, tenant_id FROM users WHERE LOWER(email) = LOWER($1)', [email.trim()]);
    if (userRes.rows.length === 0) {
      return res.json({ message: 'If the email exists in our system, a password reset link has been generated.' });
    }

    const user: any = userRes.rows[0];
    const resetToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
    const userTid = Number(user.tenant_id);

    await pgClient.query('DELETE FROM password_reset_tokens WHERE user_id = $1', [user.id]);

    await pgClient.query(
      'INSERT INTO password_reset_tokens (tenant_id, user_id, token, expires_at) VALUES ($1, $2, $3, $4)',
      [Number.isInteger(userTid) && userTid > 0 ? userTid : 1, user.id, resetToken, expiresAt]
    );

    res.json({
      message: 'Password reset token generated successfully.',
      resetToken,
      info: 'For testing counter recovery, you may use this token directly to reset your password.',
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Forgot password failed: ' + err.message });
  }
});

// Reset Password
router.post('/reset-password', async (req: Request, res: Response) => {
  try {
    const { token, newPassword } = req.body;
    if (!token || !newPassword) {
      return res.status(400).json({ error: 'Reset token and new password are required.' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters long.' });
    }

    const tokenRes = await pgClient.query(
      'SELECT user_id, expires_at FROM password_reset_tokens WHERE token = $1',
      [token]
    );

    if (tokenRes.rows.length === 0) {
      return res.status(400).json({ error: 'Invalid or expired password reset token.' });
    }

    const { user_id, expires_at } = tokenRes.rows[0] as any;
    if (new Date() > new Date(expires_at)) {
      await pgClient.query('DELETE FROM password_reset_tokens WHERE token = $1', [token]);
      return res.status(400).json({ error: 'Password reset token has expired. Please request a new one.' });
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await pgClient.query('UPDATE users SET password_hash = $1, quick_password = $2, updated_at = NOW() WHERE id = $3', [passwordHash, newPassword, user_id]);
    await pgClient.query('DELETE FROM password_reset_tokens WHERE token = $1', [token]);

    res.json({ message: 'Password has been reset successfully. You may now log in with your new password.' });
  } catch (err: any) {
    res.status(500).json({ error: 'Reset password failed: ' + err.message });
  }
});

export default router;
