import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { pgClient } from '../db/index.ts';
import { ensureSaasControlPlane } from '../db/schemaInit.ts';

const JWT_SECRET = process.env.JWT_SECRET || 'shoe-pos-super-secure-jwt-secret-key-2026';

export interface AuthUser {
  id: number;
  tenantId: number;
  slug: string;
  name: string;
  email: string;
  phone?: string;
  avatarUrl?: string;
  role: 'SUPERADMIN' | 'ADMIN' | 'CASHIER';
  status: 'PENDING' | 'APPROVED';
}

export interface AuthenticatedRequest extends Request {
  user?: AuthUser;
  tenantContext?: {
    id: number;
    slug: string;
    name: string;
    status: string;
    themeColor: string;
    backgroundColor: string;
    logoUrl: string;
    isOnboarded: boolean;
  };
}

/**
 * Generates a signed JWT containing `tenantId`, `role`, and `slug` in the payload.
 */
export function generateToken(user: {
  id: number;
  tenantId?: number;
  slug?: string;
  name: string;
  email: string;
  role: 'SUPERADMIN' | 'ADMIN' | 'CASHIER' | string;
  status: 'PENDING' | 'APPROVED' | string;
}): string {
  const tenantId = Number(user.tenantId) > 0 ? Number(user.tenantId) : 1;
  const slug = (user.slug || '').toLowerCase().trim();
  const role = (user.role || 'CASHIER').toUpperCase();

  return jwt.sign(
    {
      id: user.id,
      tenantId,
      slug,
      name: user.name,
      email: user.email,
      role,
      status: user.status,
    },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

/**
 * Strict Server-Side JWT Authentication & Tenant Isolation Middleware:
 * - Never trusts `tenant_id` in request bodies or query parameters.
 * - Extracts `tenantId`, `role`, and `slug` strictly from the decrypted JWT payload.
 * - Immediately blocks access if the tenant has been suspended by SuperAdmin.
 */
export function extractTokenFromRequest(req: Request): string | null {
  const customHeader = req.headers['x-auth-token'];
  if (typeof customHeader === 'string' && customHeader.trim()) {
    const clean = customHeader.trim().replace(/^Bearer\s+/i, '');
    if (clean && clean !== 'null' && clean !== 'undefined') {
      return clean;
    }
  }
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const clean = authHeader.split(' ')[1]?.trim();
    if (clean && clean !== 'null' && clean !== 'undefined') {
      return clean;
    }
  }
  return null;
}

export async function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  // Strip any untrusted client-supplied tenant_id / tenantId from body and query
  if (req.body && typeof req.body === 'object') {
    delete req.body.tenant_id;
    delete req.body.tenantId;
  }
  if (req.query && typeof req.query === 'object') {
    delete (req.query as any).tenant_id;
    delete (req.query as any).tenantId;
  }

  const token = extractTokenFromRequest(req);
  if (!token) {
    return res.status(401).json({ error: 'Authentication required. Please login.' });
  }

  let decoded: any;
  try {
    decoded = jwt.verify(token, JWT_SECRET);
  } catch {
    return res.status(401).json({ error: 'Invalid or expired session. Please login again.' });
  }

  try {
    await ensureSaasControlPlane();

    const userRes = await pgClient.query<any>(
      'SELECT id, tenant_id, name, email, phone, avatar_url, role, status FROM users WHERE id = $1',
      [decoded.id]
    );

    if (userRes.rows.length === 0) {
      return res.status(401).json({ error: 'User account no longer exists. Please login again.' });
    }

    const row = userRes.rows[0];
    if (row.status !== 'APPROVED') {
      return res.status(423).json({ error: 'Your account is pending Admin approval.' });
    }

    // Strict tenantId resolution from decrypted JWT & verified user row
    const jwtTid = Number(decoded.tenantId);
    const rowTid = Number(row.tenant_id);
    const resolvedTenantId =
      Number.isInteger(jwtTid) && jwtTid > 0
        ? jwtTid
        : Number.isInteger(rowTid) && rowTid > 0
        ? rowTid
        : 1;
    let resolvedSlug = String(decoded.slug || '').toLowerCase();
    const resolvedRole = String(row.role || decoded.role || 'CASHIER').toUpperCase() as 'SUPERADMIN' | 'ADMIN' | 'CASHIER';

    // Real-time Tenant Suspension & Subscription Expiry Enforcement at Middleware Level (except for global SUPERADMIN)
    if (resolvedRole !== 'SUPERADMIN') {
      try {
        const tenantCheck = await pgClient.query<{
          id: number;
          slug: string;
          status: string;
          name: string;
          subscription_end_date: Date | string | null;
          subscription_status: string | null;
        }>(
          'SELECT id, slug, status, name, subscription_end_date, subscription_status FROM tenants WHERE id = $1 LIMIT 1',
          [resolvedTenantId]
        );
        if (tenantCheck.rows.length > 0) {
          const tRow = tenantCheck.rows[0];
          resolvedSlug = tRow.slug || resolvedSlug;
          const isExpiredByDate =
            tRow.subscription_end_date && new Date(tRow.subscription_end_date).getTime() < Date.now();
          const isMarkedExpired =
            String(tRow.subscription_status || '').toUpperCase() === 'EXPIRED' ||
            String(tRow.status || '').toUpperCase() === 'EXPIRED';

          if (isExpiredByDate || isMarkedExpired) {
            if (String(tRow.subscription_status || '').toUpperCase() !== 'EXPIRED') {
              await pgClient
                .query(
                  `UPDATE tenants SET subscription_status = 'EXPIRED', updated_at = NOW() WHERE id = $1`,
                  [tRow.id]
                )
                .catch(() => {});
            }
            const fullPath = String(req.originalUrl || req.baseUrl || req.path || '').toLowerCase();
            const isAllowedExpiredAdminRoute =
              resolvedRole === 'ADMIN' &&
              (fullPath.includes('/api/settings') ||
                fullPath.includes('/api/auth') ||
                fullPath.includes('/api/saas') ||
                fullPath.includes('/api/install/status'));
            if (!isAllowedExpiredAdminRoute) {
              return res.status(403).json({
                error: 'Your subscription key has expired. Please contact support to renew.',
                code: 'SUBSCRIPTION_EXPIRED',
                tenantSlug: tRow.slug,
              });
            }
          }

          if (
            String(tRow.status).toUpperCase() === 'SUSPENDED' ||
            String(tRow.subscription_status || '').toUpperCase() === 'SUSPENDED'
          ) {
            return res.status(423).json({
              error: `Store Suspended: Access to "${tRow.name}" has been suspended by platform administration.`,
              code: 'TENANT_SUSPENDED',
              tenantSlug: tRow.slug,
            });
          }
        }
      } catch (_) {}
    }

    req.user = {
      id: row.id,
      tenantId: resolvedTenantId,
      slug: resolvedSlug,
      name: row.name,
      email: row.email,
      phone: row.phone || '',
      avatarUrl: row.avatar_url || '',
      role: resolvedRole,
      status: row.status,
    };

    next();
  } catch (dbErr: any) {
    console.error('requireAuth database error:', dbErr?.message || dbErr);
    return res.status(503).json({ error: 'Database service temporarily unavailable. Please retry.' });
  }
}

export function forbidCashier(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required. Please login.' });
  }
  const role = (req.user.role || '').toLowerCase();
  if (role === 'cashier') {
    return res.status(423).json({ error: 'Access forbidden: Cashier role is not authorized for this operation.' });
  }
  next();
}

export function requireAdmin(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required. Please login.' });
  }
  const role = (req.user.role || '').toLowerCase();
  if (role === 'cashier') {
    return res.status(423).json({ error: 'Access forbidden: Cashier role is not authorized for this operation.' });
  }
  if (role !== 'admin' && role !== 'superadmin' && role !== 'manager') {
    return res.status(423).json({ error: 'Admin permission required for this operation.' });
  }
  next();
}

export function requireSuperAdmin(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({ error: 'SuperAdmin authentication required.' });
  }
  const role = (req.user.role || '').toUpperCase();
  if (role !== 'SUPERADMIN') {
    return res.status(423).json({ error: 'Access forbidden: SUPERADMIN role required to access SaaS Control Panel.' });
  }
  next();
}
