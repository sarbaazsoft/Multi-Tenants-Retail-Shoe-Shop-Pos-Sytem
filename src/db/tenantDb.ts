import { pgClient } from './index.ts';
import type { AuthenticatedRequest } from '../server/auth.ts';

/**
 * Strict Server-Side Tenant Extractor:
 * NEVER trusts `tenant_id` or `tenantId` from `req.body` or `req.query`.
 * Extracts `tenantId` strictly from the verified & decrypted JWT payload (`req.user.tenantId`).
 */
export function extractStrictTenantId(req: AuthenticatedRequest): number {
  // Strip any untrusted client-supplied tenant_id parameters to prevent IDOR injection
  if (req.body && typeof req.body === 'object') {
    delete req.body.tenant_id;
    delete req.body.tenantId;
  }
  if (req.query && typeof req.query === 'object') {
    delete (req.query as any).tenant_id;
    delete (req.query as any).tenantId;
  }

  const jwtTenantId = Number(req.user?.tenantId);
  if (!jwtTenantId || isNaN(jwtTenantId) || jwtTenantId <= 0) {
    throw new Error('Unauthorized: Missing or invalid tenantId in decrypted JWT session.');
  }
  return jwtTenantId;
}

/**
 * Tenant-Scoped Database Service Wrapper
 * Automatically attaches `WHERE tenant_id = $tenantId` to all CRUD operations
 * for Products, Sales, Customers, Inventory, and Settings to prevent Cross-Tenant IDOR.
 */
export class TenantScopedDb {
  public readonly tenantId: number;

  constructor(tenantId: number) {
    if (!tenantId || isNaN(tenantId) || tenantId <= 0) {
      throw new Error('Invalid tenantId provided to TenantScopedDb');
    }
    this.tenantId = Number(tenantId);
  }

  // =========================================================================
  // 1. PRODUCTS CRUD (Scoped strictly by tenant_id)
  // =========================================================================
  public products = {
    findMany: async (filters?: { search?: string; brand?: string; category?: string; lowStockOnly?: boolean; limit?: number }) => {
      let sql = `SELECT * FROM products WHERE tenant_id = $1 AND active = true`;
      const params: any[] = [this.tenantId];

      if (filters?.search?.trim()) {
        params.push(`%${filters.search.trim().toLowerCase()}%`);
        const idx = params.length;
        sql += ` AND (LOWER(article) LIKE $${idx} OR LOWER(name) LIKE $${idx} OR LOWER(sku) LIKE $${idx} OR barcode LIKE $${idx} OR LOWER(brand) LIKE $${idx})`;
      }
      if (filters?.brand?.trim() && filters.brand !== 'ALL') {
        params.push(filters.brand.trim().toLowerCase());
        sql += ` AND LOWER(brand) = $${params.length}`;
      }
      if (filters?.category?.trim() && filters.category !== 'ALL') {
        params.push(filters.category.trim().toLowerCase());
        sql += ` AND LOWER(category) = $${params.length}`;
      }
      if (filters?.lowStockOnly) {
        sql += ` AND total_stock <= COALESCE(low_stock_limit, 5)`;
      }

      sql += ` ORDER BY id DESC`;
      if (filters?.limit && filters.limit > 0) {
        params.push(Number(filters.limit));
        sql += ` LIMIT $${params.length}`;
      }

      const res = await pgClient.query(sql, params);
      return res.rows;
    },

    findById: async (id: number) => {
      const res = await pgClient.query(
        `SELECT * FROM products WHERE id = $1 AND tenant_id = $2 LIMIT 1`,
        [id, this.tenantId]
      );
      return res.rows[0] || null;
    },

    findByBarcodeOrArticle: async (code: string) => {
      const clean = code.trim();
      const res = await pgClient.query(
        `SELECT * FROM products
         WHERE tenant_id = $1 AND active = true
           AND (barcode = $2 OR LOWER(sku) = LOWER($2) OR LOWER(article) = LOWER($2))
         LIMIT 1`,
        [this.tenantId, clean]
      );
      return res.rows[0] || null;
    },

    create: async (data: {
      name: string;
      brand: string;
      category: string;
      sku: string;
      barcode: string;
      article: string;
      primaryImageUrl?: string;
      description?: string;
      costPrice: number;
      sellingPrice: number;
      minPrice: number;
      maxPrice: number;
      totalStock: number;
      lowStockLimit?: number;
    }) => {
      const res = await pgClient.query(
        `INSERT INTO products (
          tenant_id, name, brand, category, sku, barcode, article,
          primary_image_url, description, cost_price, selling_price,
          min_price, max_price, total_stock, low_stock_limit, active
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, true)
        RETURNING *`,
        [
          this.tenantId,
          data.name,
          data.brand,
          data.category,
          data.sku,
          data.barcode,
          data.article,
          data.primaryImageUrl || '',
          data.description || '',
          data.costPrice,
          data.sellingPrice,
          data.minPrice,
          data.maxPrice,
          data.totalStock,
          data.lowStockLimit ?? 5,
        ]
      );
      return res.rows[0];
    },

    update: async (id: number, data: Partial<{
      name: string;
      brand: string;
      category: string;
      sku: string;
      barcode: string;
      article: string;
      primaryImageUrl: string;
      description: string;
      costPrice: number;
      sellingPrice: number;
      minPrice: number;
      maxPrice: number;
      totalStock: number;
      lowStockLimit: number;
    }>) => {
      const existing = await this.products.findById(id);
      if (!existing) return null;

      const res = await pgClient.query(
        `UPDATE products SET
          name = $1, brand = $2, category = $3, sku = $4, barcode = $5,
          article = $6, primary_image_url = $7, description = $8,
          cost_price = $9, selling_price = $10, min_price = $11, max_price = $12,
          total_stock = $13, low_stock_limit = $14, updated_at = NOW()
         WHERE id = $15 AND tenant_id = $16
         RETURNING *`,
        [
          data.name ?? existing.name,
          data.brand ?? existing.brand,
          data.category ?? existing.category,
          data.sku ?? existing.sku,
          data.barcode ?? existing.barcode,
          data.article ?? existing.article,
          data.primaryImageUrl ?? existing.primary_image_url,
          data.description ?? existing.description,
          data.costPrice ?? existing.cost_price,
          data.sellingPrice ?? existing.selling_price,
          data.minPrice ?? existing.min_price,
          data.maxPrice ?? existing.max_price,
          data.totalStock ?? existing.total_stock,
          data.lowStockLimit ?? existing.low_stock_limit,
          id,
          this.tenantId,
        ]
      );
      return res.rows[0] || null;
    },

    delete: async (id: number) => {
      const res = await pgClient.query(
        `DELETE FROM products WHERE id = $1 AND tenant_id = $2 RETURNING id`,
        [id, this.tenantId]
      );
      return (res.rowCount ?? res.rows.length) > 0;
    },
  };

  // =========================================================================
  // 2. CUSTOMERS CRUD (Scoped strictly by tenant_id)
  // =========================================================================
  public customers = {
    findMany: async (search?: string) => {
      let query = `
        SELECT c.*,
               COUNT(s.id)::int as total_orders,
               COALESCE(SUM(s.total_amount), 0)::numeric as total_spent,
               FLOOR(COALESCE(SUM(s.total_amount), 0) / 100)::int as loyalty_points,
               MAX(s.sale_date) as last_visit,
               MAX(s.created_at) as last_sale_at
        FROM customers c
        LEFT JOIN sales s ON c.id = s.customer_id AND s.tenant_id = $1
        WHERE c.tenant_id = $1
      `;
      const params: any[] = [this.tenantId];

      if (search && search.trim()) {
        params.push(`%${search.trim().toLowerCase()}%`);
        const idx = params.length;
        query += ` AND (LOWER(c.name) LIKE $${idx} OR LOWER(c.phone) LIKE $${idx} OR LOWER(COALESCE(c.email, '')) LIKE $${idx} OR CAST(c.id AS TEXT) LIKE $${idx})`;
      }

      query += ` GROUP BY c.id ORDER BY c.id DESC`;
      const res = await pgClient.query(query, params);
      return res.rows;
    },

    findById: async (id: number) => {
      const custRes = await pgClient.query(
        `SELECT * FROM customers WHERE id = $1 AND tenant_id = $2 LIMIT 1`,
        [id, this.tenantId]
      );
      if (custRes.rows.length === 0) return null;

      const salesRes = await pgClient.query(
        `SELECT id, invoice_number, sale_date, total_amount, payment_method, created_at
         FROM sales
         WHERE customer_id = $1 AND tenant_id = $2
         ORDER BY id DESC LIMIT 20`,
        [id, this.tenantId]
      );
      return { customer: custRes.rows[0], sales: salesRes.rows };
    },

    create: async (data: { name: string; phone: string; email?: string; address?: string; notes?: string }) => {
      const res = await pgClient.query(
        `INSERT INTO customers (tenant_id, name, phone, email, address, notes)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [
          this.tenantId,
          data.name.trim(),
          data.phone.trim(),
          data.email?.trim() || null,
          data.address?.trim() || null,
          data.notes?.trim() || null,
        ]
      );
      return res.rows[0];
    },

    update: async (id: number, data: { name: string; phone: string; email?: string; address?: string; notes?: string }) => {
      const res = await pgClient.query(
        `UPDATE customers SET
           name = $1, phone = $2, email = $3, address = $4, notes = $5
         WHERE id = $6 AND tenant_id = $7
         RETURNING *`,
        [
          data.name.trim(),
          data.phone.trim(),
          data.email?.trim() || null,
          data.address?.trim() || null,
          data.notes?.trim() || null,
          id,
          this.tenantId,
        ]
      );
      return res.rows[0] || null;
    },

    delete: async (id: number) => {
      const res = await pgClient.query(
        `DELETE FROM customers WHERE id = $1 AND tenant_id = $2 RETURNING id`,
        [id, this.tenantId]
      );
      return (res.rowCount ?? res.rows.length) > 0;
    },
  };

  // =========================================================================
  // 3. SALES CRUD (Scoped strictly by tenant_id)
  // =========================================================================
  public sales = {
    findMany: async (filters?: { search?: string; limit?: number }) => {
      let sql = `
        SELECT s.*,
               c.name as customer_name, c.phone as customer_phone,
               u.name as cashier_name
        FROM sales s
        LEFT JOIN customers c ON s.customer_id = c.id AND c.tenant_id = $1
        LEFT JOIN users u ON s.created_by = u.id
        WHERE s.tenant_id = $1
      `;
      const params: any[] = [this.tenantId];

      if (filters?.search?.trim()) {
        params.push(`%${filters.search.trim().toLowerCase()}%`);
        const idx = params.length;
        sql += ` AND (LOWER(s.invoice_number) LIKE $${idx} OR LOWER(COALESCE(c.name, '')) LIKE $${idx} OR LOWER(COALESCE(c.phone, '')) LIKE $${idx})`;
      }

      sql += ` ORDER BY s.id DESC LIMIT $${params.length + 1}`;
      params.push(Number(filters?.limit) || 100);

      const res = await pgClient.query(sql, params);
      return res.rows;
    },

    findById: async (id: number) => {
      const saleRes = await pgClient.query(
        `SELECT s.*, c.name as customer_name, c.phone as customer_phone, u.name as cashier_name
         FROM sales s
         LEFT JOIN customers c ON s.customer_id = c.id AND c.tenant_id = $2
         LEFT JOIN users u ON s.created_by = u.id
         WHERE s.id = $1 AND s.tenant_id = $2
         LIMIT 1`,
        [id, this.tenantId]
      );
      if (saleRes.rows.length === 0) return null;

      const itemsRes = await pgClient.query(
        `SELECT si.*, p.sku, p.barcode, p.brand, p.category, COALESCE(p.article, si.product_name) as article
         FROM sale_items si
         LEFT JOIN products p ON si.product_id = p.id AND p.tenant_id = $2
         WHERE si.sale_id = $1 AND si.tenant_id = $2`,
        [id, this.tenantId]
      );

      return { sale: saleRes.rows[0], items: itemsRes.rows };
    },
  };

  // =========================================================================
  // 4. INVENTORY & STOCK LEDGER (Scoped strictly by tenant_id)
  // =========================================================================
  public inventory = {
    getLedger: async (filters?: { productId?: number; movementType?: string; limit?: number }) => {
      let query = `
        SELECT sm.*, COALESCE(p.article, p.name) as article, COALESCE(p.article, p.name) as product_name,
               p.sku, p.barcode, u.name as user_name
        FROM stock_movements sm
        JOIN products p ON sm.product_id = p.id AND p.tenant_id = $1
        LEFT JOIN users u ON sm.user_id = u.id
        WHERE sm.tenant_id = $1
      `;
      const params: any[] = [this.tenantId];

      if (filters?.productId && !isNaN(Number(filters.productId))) {
        params.push(Number(filters.productId));
        query += ` AND sm.product_id = $${params.length}`;
      }
      if (filters?.movementType && typeof filters.movementType === 'string') {
        params.push(filters.movementType);
        query += ` AND sm.movement_type = $${params.length}`;
      }

      query += ` ORDER BY sm.id DESC LIMIT $${params.length + 1}`;
      params.push(Number(filters?.limit) || 100);

      const res = await pgClient.query(query, params);
      return res.rows;
    },

    adjustStock: async (params: { productId: number; newStock: number; notes: string; userId: number }) => {
      await pgClient.query('BEGIN');
      try {
        const prodRes = await pgClient.query<{ id: number; name: string; article: string; total_stock: number }>(
          `SELECT id, name, article, total_stock FROM products WHERE id = $1 AND tenant_id = $2 FOR UPDATE`,
          [params.productId, this.tenantId]
        );
        if (prodRes.rows.length === 0) {
          throw new Error('Product not found in your store inventory.');
        }

        const prod = prodRes.rows[0];
        const prevStock = prod.total_stock;
        const qtyChange = params.newStock - prevStock;

        if (qtyChange === 0) {
          throw new Error('New stock count is identical to existing stock count.');
        }

        await pgClient.query(
          `UPDATE products SET total_stock = $1, updated_at = NOW() WHERE id = $2 AND tenant_id = $3`,
          [params.newStock, prod.id, this.tenantId]
        );

        await pgClient.query(
          `INSERT INTO stock_movements (
            tenant_id, product_id, qty_change, prev_stock, new_stock, movement_type, reference_id, user_id, notes
          ) VALUES ($1, $2, $3, $4, $5, 'ADJUSTMENT', 'MANUAL-ADJUST', $6, $7)`,
          [this.tenantId, prod.id, qtyChange, prevStock, params.newStock, params.userId, params.notes.trim()]
        );

        await pgClient.query('COMMIT');
        return {
          product: prod,
          prevStock,
          newStock: params.newStock,
          qtyChange,
        };
      } catch (err) {
        await pgClient.query('ROLLBACK');
        throw err;
      }
    },
  };
}

/**
 * Helper to instantiate a TenantScopedDb strictly from the authenticated user's JWT payload.
 */
export function getTenantDb(req: AuthenticatedRequest): TenantScopedDb {
  const tenantId = extractStrictTenantId(req);
  return new TenantScopedDb(tenantId);
}
