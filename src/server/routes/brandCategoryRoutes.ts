import { Router } from 'express';
import type { Response } from 'express';
import { pgClient } from '../../db/index.ts';
import { requireAuth } from '../auth.ts';
import type { AuthenticatedRequest as AuthRequest } from '../auth.ts';

const router = Router();

function getTenantId(req: AuthRequest): number {
  return Number((req as any).tenantId || req.user?.tenantId || 1);
}

// ==========================================
// BRANDS ROUTES (/api/brands)
// ==========================================

// GET /api/brands - Fetch all brands (merged from brands table + distinct product brands)
router.get('/brands', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = getTenantId(req);

    // Ensure "Local" default brand always exists for this tenant
    await pgClient
      .query(
        `INSERT INTO brands (tenant_id, name)
         SELECT $1, 'Local'
         WHERE NOT EXISTS (
           SELECT 1 FROM brands WHERE tenant_id = $1 AND LOWER(TRIM(name)) = 'local'
         )`,
        [tenantId]
      )
      .catch(() => {});

    // Sync any distinct brands from products into the brands table for this tenant
    await pgClient
      .query(
        `INSERT INTO brands (tenant_id, name)
         SELECT DISTINCT $1:: integer, TRIM(brand)
         FROM products
         WHERE tenant_id = $1
           AND brand IS NOT NULL
           AND TRIM(brand) != ''
           AND LOWER(TRIM(brand)) NOT IN (
             SELECT LOWER(TRIM(name)) FROM brands WHERE tenant_id = $1
           )`,
        [tenantId]
      )
      .catch(() => {});

    const result = await pgClient.query<any>(
      `SELECT id, name, created_at FROM brands
       WHERE tenant_id = $1
       ORDER BY CASE WHEN LOWER(TRIM(name)) = 'local' THEN 0 ELSE 1 END, LOWER(name) ASC`,
      [tenantId]
    );
    res.json({ brands: result.rows });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to fetch brands: ' + err.message });
  }
});

// POST /api/brands - Create a new brand
router.post('/brands', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const name = (req.body.name || '').trim();
    if (!name) {
      return res.status(400).json({ error: 'Brand name is required' });
    }

    const existing = await pgClient.query<any>(
      `SELECT id, name, created_at FROM brands WHERE tenant_id = $1 AND LOWER(TRIM(name)) = LOWER($2) LIMIT 1`,
      [tenantId, name]
    );

    if (existing.rows.length > 0) {
      return res.status(200).json({ brand: existing.rows[0], message: 'Brand already exists' });
    }

    const result = await pgClient.query<any>(
      `INSERT INTO brands (tenant_id, name) VALUES ($1, $2) RETURNING id, name, created_at`,
      [tenantId, name]
    );

    res.status(201).json({ brand: result.rows[0], message: 'Brand created successfully' });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to create brand: ' + err.message });
  }
});

// DELETE /api/brands/:id - Delete a brand
router.delete('/brands/:id', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const { id } = req.params;
    await pgClient.query(`DELETE FROM brands WHERE id = $1 AND tenant_id = $2`, [id, tenantId]);
    res.json({ message: 'Brand deleted successfully' });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to delete brand: ' + err.message });
  }
});

// ==========================================
// CATEGORIES ROUTES (/api/categories)
// ==========================================

// GET /api/categories - Fetch all categories (merged from categories table + distinct product categories)
router.get('/categories', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = getTenantId(req);

    // Sync any distinct categories from products into the categories table for this tenant
    await pgClient
      .query(
        `INSERT INTO categories (tenant_id, name)
         SELECT DISTINCT $1::integer, TRIM(category)
         FROM products
         WHERE tenant_id = $1
           AND category IS NOT NULL
           AND TRIM(category) != ''
           AND LOWER(TRIM(category)) NOT IN (
             SELECT LOWER(TRIM(name)) FROM categories WHERE tenant_id = $1
           )`,
        [tenantId]
      )
      .catch(() => {});

    const result = await pgClient.query<any>(
      `SELECT id, name, created_at FROM categories WHERE tenant_id = $1 ORDER BY LOWER(name) ASC`,
      [tenantId]
    );
    res.json({ categories: result.rows });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to fetch categories: ' + err.message });
  }
});

// POST /api/categories - Create a new category
router.post('/categories', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const name = (req.body.name || '').trim();
    if (!name) {
      return res.status(400).json({ error: 'Category name is required' });
    }

    const existing = await pgClient.query<any>(
      `SELECT id, name, created_at FROM categories WHERE tenant_id = $1 AND LOWER(TRIM(name)) = LOWER($2) LIMIT 1`,
      [tenantId, name]
    );

    if (existing.rows.length > 0) {
      return res.status(200).json({ category: existing.rows[0], message: 'Category already exists' });
    }

    const result = await pgClient.query<any>(
      `INSERT INTO categories (tenant_id, name) VALUES ($1, $2) RETURNING id, name, created_at`,
      [tenantId, name]
    );

    res.status(201).json({ category: result.rows[0], message: 'Category created successfully' });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to create category: ' + err.message });
  }
});

// DELETE /api/categories/:id - Delete a category
router.delete('/categories/:id', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const { id } = req.params;
    await pgClient.query(`DELETE FROM categories WHERE id = $1 AND tenant_id = $2`, [id, tenantId]);
    res.json({ message: 'Category deleted successfully' });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to delete category: ' + err.message });
  }
});

export default router;
