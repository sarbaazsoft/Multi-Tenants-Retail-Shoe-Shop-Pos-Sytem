import { Router } from 'express';
import type { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { pgClient, dbInfo } from '../../db/index.ts';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || 'shoe-pos-super-secure-jwt-secret-key-2026';

export interface RealtimeNotification {
  id: string;
  type: 'danger' | 'warning' | 'success' | 'info' | 'system';
  title: string;
  message: string;
  icon: 'alert-triangle' | 'alert-circle' | 'check-circle' | 'shopping-bag' | 'arrow-left-right' | 'truck' | 'database' | 'boxes';
  color: string;
  badgeColor: string;
  actionTab: string;
  time: string;
  timestamp: string;
  read?: boolean;
}

function formatTimeAgo(dateInput: string | Date | null | undefined): string {
  if (!dateInput) return 'Recently';
  const now = new Date();
  const date = new Date(dateInput);
  if (isNaN(date.getTime())) return 'Recently';

  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

function resolveNotificationTenantId(req: Request): number {
  const customToken = typeof req.headers['x-auth-token'] === 'string' ? req.headers['x-auth-token'].trim() : '';
  const authHeader = req.headers.authorization;
  const rawToken = customToken || (authHeader && authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : '');
  if (rawToken) {
    try {
      const decoded: any = jwt.verify(rawToken, JWT_SECRET);
      if (decoded && typeof decoded.tenantId === 'number' && decoded.tenantId > 0) {
        return decoded.tenantId;
      }
    } catch {
      // fallback to 1
    }
  }
  return 1;
}

// GET /api/notifications - Real-time dynamic notifications from live PostgreSQL data (Tenant-Scoped)
router.get('/', async (req: Request, res: Response) => {
  try {
    await pgClient.waitReady;
    const tenantId = resolveNotificationTenantId(req);
    const notifications: RealtimeNotification[] = [];
    const nowIso = new Date().toISOString();
    const today = nowIso.split('T')[0];

    // 1. Check Out of Stock Products
    const outOfStockRes = await pgClient.query<{
      count: string;
      names: string;
    }>(
      `SELECT 
         COUNT(*)::text as count,
         STRING_AGG(COALESCE(p.article, p.name), ', ') as names
       FROM (
         SELECT id, name, article
         FROM products
         WHERE tenant_id = $1 AND active = true AND total_stock <= 0
         ORDER BY id DESC
         LIMIT 3
       ) p`,
      [tenantId]
    ).catch(() => ({ rows: [] }));

    const outOfStockTotal = await pgClient.query<{ total: string }>(
      `SELECT COUNT(*)::text as total FROM products WHERE tenant_id = $1 AND active = true AND total_stock <= 0`,
      [tenantId]
    ).catch(() => ({ rows: [] }));

    const outCount = parseInt(outOfStockTotal.rows[0]?.total || '0', 10);
    if (outCount > 0) {
      const sampleNames = outOfStockRes.rows[0]?.names || 'Products';
      notifications.push({
        id: `out-of-stock-${outCount}`,
        type: 'danger',
        title: 'Out of Stock Alert',
        message: `${outCount} item${outCount > 1 ? 's' : ''} currently zero stock (${sampleNames})`,
        icon: 'alert-circle',
        color: 'text-rose-500 bg-rose-50 dark:bg-rose-950/60',
        badgeColor: 'bg-rose-500',
        actionTab: 'inventory',
        time: 'Urgent',
        timestamp: nowIso,
      });
    }

    // 2. Check Low Stock Threshold Products
    const lowStockRes = await pgClient.query<{
      count: string;
      names: string;
    }>(
      `SELECT 
         COUNT(*)::text as count,
         STRING_AGG(COALESCE(p.article, p.name), ', ') as names
       FROM (
         SELECT p.id, p.name, p.article
         FROM products p
         WHERE p.tenant_id = $1 AND p.active = true 
           AND p.total_stock > 0 
           AND p.total_stock <= COALESCE(p.low_stock_limit, 5)
         ORDER BY p.total_stock ASC
         LIMIT 3
       ) p`,
      [tenantId]
    ).catch(() => ({ rows: [] }));

    const lowStockTotal = await pgClient.query<{ total: string }>(
      `SELECT COUNT(*)::text as total 
       FROM products p
       WHERE p.tenant_id = $1 AND p.active = true 
         AND p.total_stock > 0 
         AND p.total_stock <= COALESCE(p.low_stock_limit, 5)`,
      [tenantId]
    ).catch(() => ({ rows: [] }));

    const lowCount = parseInt(lowStockTotal.rows[0]?.total || '0', 10);
    if (lowCount > 0) {
      const sampleNames = lowStockRes.rows[0]?.names || 'Products';
      notifications.push({
        id: `low-stock-${lowCount}`,
        type: 'warning',
        title: 'Low Stock Warning',
        message: `${lowCount} item${lowCount > 1 ? 's' : ''} below reorder threshold (${sampleNames})`,
        icon: 'alert-triangle',
        color: 'text-amber-500 bg-amber-50 dark:bg-amber-950/60',
        badgeColor: 'bg-amber-500',
        actionTab: 'inventory',
        time: 'Warning',
        timestamp: nowIso,
      });
    } else if (outCount === 0) {
      const totalActiveProducts = await pgClient.query<{ total: string }>(
        `SELECT COUNT(*)::text as total FROM products WHERE tenant_id = $1 AND active = true`,
        [tenantId]
      ).catch(() => ({ rows: [] }));
      const activeCount = parseInt(totalActiveProducts.rows[0]?.total || '0', 10);
      if (activeCount > 0) {
        notifications.push({
          id: `healthy-stock-${activeCount}`,
          type: 'info',
          title: 'Inventory Healthy',
          message: `All ${activeCount} active items are well above safety stock limits`,
          icon: 'boxes',
          color: 'text-purple-600 dark:text-purple-300 bg-purple-50 dark:bg-purple-950/60 border border-purple-100 dark:border-purple-900/50',
          badgeColor: 'bg-purple-600',
          actionTab: 'inventory',
          time: 'Normal',
          timestamp: nowIso,
        });
      }
    }

    // 3. Today's Real-time Sales Summary
    const todaySales = await pgClient.query<{
      count: string;
      total: string;
    }>(
      `SELECT COUNT(*)::text as count, COALESCE(SUM(total_amount), 0)::text as total
       FROM sales 
       WHERE tenant_id = $1 AND (sale_date = $2 OR sale_date = CURRENT_DATE::text)`,
      [tenantId, today]
    ).catch(() => ({ rows: [] }));

    const salesTodayCount = parseInt(todaySales.rows[0]?.count || '0', 10);
    const salesTodayAmount = Math.round(parseFloat(todaySales.rows[0]?.total || '0'));

    if (salesTodayCount > 0) {
      notifications.push({
        id: `today-sales-${salesTodayCount}-${salesTodayAmount}`,
        type: 'success',
        title: "Today's Sales Performance",
        message: `${salesTodayCount} invoice${salesTodayCount > 1 ? 's' : ''} generated today totaling Rs. ${salesTodayAmount}`,
        icon: 'shopping-bag',
        color: 'text-purple-600 dark:text-purple-300 bg-purple-50 dark:bg-purple-950/60 border border-purple-100 dark:border-purple-900/50',
        badgeColor: 'bg-purple-600',
        actionTab: 'reports',
        time: 'Today',
        timestamp: nowIso,
      });
    } else {
      notifications.push({
        id: 'today-sales-pending',
        type: 'info',
        title: 'POS Register Ready',
        message: 'No sales closed yet today. Terminal ready for new checkout transactions.',
        icon: 'shopping-bag',
        color: 'text-purple-600 dark:text-purple-300 bg-purple-50 dark:bg-purple-950/60 border border-purple-100 dark:border-purple-900/50',
        badgeColor: 'bg-purple-600',
        actionTab: 'pos',
        time: 'Today',
        timestamp: nowIso,
      });
    }

    // 4. Latest Completed Sale Transaction
    const latestSaleRes = await pgClient.query<{
      id: number;
      invoice_number: string;
      total_amount: string;
      created_at: string;
      customer_name: string;
    }>(
      `SELECT s.id, s.invoice_number, s.total_amount, s.created_at,
              COALESCE(c.name, 'Walk-in Customer') as customer_name
       FROM sales s
       LEFT JOIN customers c ON s.customer_id = c.id AND c.tenant_id = $1
       WHERE s.tenant_id = $1
       ORDER BY s.id DESC
       LIMIT 1`,
      [tenantId]
    ).catch(() => ({ rows: [] }));

    if (latestSaleRes.rows.length > 0) {
      const s = latestSaleRes.rows[0];
      notifications.push({
        id: `latest-sale-${s.id}`,
        type: 'success',
        title: 'Recent Invoice Closed',
        message: `Invoice #${s.invoice_number} (Rs. ${Math.round(parseFloat(s.total_amount))}) to ${s.customer_name}`,
        icon: 'check-circle',
        color: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-950/60',
        badgeColor: 'bg-emerald-600',
        actionTab: 'pos',
        time: formatTimeAgo(s.created_at),
        timestamp: s.created_at,
      });
    }

    // 5. Recent Customer Return
    const latestReturnRes = await pgClient.query<{
      id: number;
      return_number: string;
      invoice_number: string;
      total_refund_amount: string;
      created_at: string;
    }>(
      `SELECT r.id, r.return_number, s.invoice_number, r.total_refund_amount, r.created_at
       FROM returns r
       LEFT JOIN sales s ON r.original_sale_id = s.id AND s.tenant_id = $1
       WHERE r.tenant_id = $1
       ORDER BY r.id DESC
       LIMIT 1`,
      [tenantId]
    ).catch(() => ({ rows: [] }));

    if (latestReturnRes.rows.length > 0) {
      const ret = latestReturnRes.rows[0];
      notifications.push({
        id: `latest-return-${ret.id}`,
        type: 'warning',
        title: 'Customer Return Logged',
        message: `Return #${ret.return_number} (Rs. ${Math.round(parseFloat(ret.total_refund_amount))}) for inv #${ret.invoice_number || ''}`,
        icon: 'arrow-left-right',
        color: 'text-indigo-600 bg-indigo-50 dark:bg-indigo-950/60',
        badgeColor: 'bg-indigo-600',
        actionTab: 'returns',
        time: formatTimeAgo(ret.created_at),
        timestamp: ret.created_at,
      });
    }

    // 6. Recent Supplier Purchase Consignment
    const latestPurchaseRes = await pgClient.query<{
      id: number;
      purchase_number: string;
      total_amount: string;
      created_at: string;
      supplier_name: string;
    }>(
      `SELECT p.id, p.purchase_number, p.total_amount, p.created_at,
              COALESCE(s.name, 'Supplier') as supplier_name
       FROM purchases p
       LEFT JOIN suppliers s ON p.supplier_id = s.id AND s.tenant_id = $1
       WHERE p.tenant_id = $1
       ORDER BY p.id DESC
       LIMIT 1`,
      [tenantId]
    ).catch(() => ({ rows: [] }));

    if (latestPurchaseRes.rows.length > 0) {
      const pur = latestPurchaseRes.rows[0];
      notifications.push({
        id: `latest-purchase-${pur.id}`,
        type: 'info',
        title: 'Supplier Consignment',
        message: `PO #${pur.purchase_number} from ${pur.supplier_name} (Rs. ${Math.round(parseFloat(pur.total_amount))})`,
        icon: 'truck',
        color: 'text-cyan-600 bg-cyan-50 dark:bg-cyan-950/60',
        badgeColor: 'bg-cyan-600',
        actionTab: 'purchases',
        time: formatTimeAgo(pur.created_at),
        timestamp: pur.created_at,
      });
    }

    // 7. Real PostgreSQL Engine Health
    notifications.push({
      id: 'system-db-sync',
      type: 'system',
      title: 'PostgreSQL Database Engine',
      message: `Active & connected (${dbInfo.host || 'Neon Serverless'}) with tenant isolation (Store #${tenantId})`,
      icon: 'database',
      color: 'text-purple-600 dark:text-purple-300 bg-purple-50 dark:bg-purple-950/60 border border-purple-100 dark:border-purple-900/50',
      badgeColor: 'bg-purple-600',
      actionTab: 'dashboard',
      time: 'Live',
      timestamp: nowIso,
    });

    res.json({
      success: true,
      notifications,
      count: notifications.length,
      timestamp: nowIso,
    });
  } catch (err: any) {
    console.error('Error fetching real-time notifications:', err);
    res.status(500).json({
      error: 'Failed to retrieve real-time notifications: ' + err.message,
      notifications: [],
    });
  }
});

export default router;
