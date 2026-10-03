import { Router } from 'express';
import type { Response } from 'express';
import { pgClient } from '../../db/index.ts';
import { requireAuth } from '../auth.ts';
import type { AuthenticatedRequest as AuthRequest } from '../auth.ts';
import { STANDARD_FOOTWEAR_CATEGORIES } from '../../utils/sku.ts';

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

    // Clean any duplicate brands if present
    await pgClient
      .query(
        `DELETE FROM brands a USING brands b
         WHERE a.id > b.id
           AND a.tenant_id = b.tenant_id
           AND LOWER(TRIM(a.name)) = LOWER(TRIM(b.name))`
      )
      .catch(() => {});

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
         SELECT DISTINCT $1::integer, TRIM(brand)
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
      `SELECT DISTINCT ON (LOWER(TRIM(name))) id, name, created_at
       FROM brands
       WHERE tenant_id = $1
       ORDER BY LOWER(TRIM(name)), id ASC`,
      [tenantId]
    );

    // Sort with 'Local' first, then alphabetical
    const sorted = result.rows.sort((a, b) => {
      const aLocal = a.name.trim().toLowerCase() === 'local';
      const bLocal = b.name.trim().toLowerCase() === 'local';
      if (aLocal && !bLocal) return -1;
      if (!aLocal && bLocal) return 1;
      return a.name.localeCompare(b.name);
    });

    res.json({ brands: sorted });
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

// GET /api/categories - Fetch the store's fixed pre-saved categories (Men, Women, Kids, Toddler, Infant)
router.get('/categories', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = getTenantId(req);

    await pgClient
      .exec(`
        CREATE TABLE IF NOT EXISTS categories (
          id SERIAL PRIMARY KEY,
          tenant_id INTEGER NOT NULL DEFAULT 1,
          name TEXT NOT NULL,
          created_at TIMESTAMP NOT NULL DEFAULT NOW()
        );
        ALTER TABLE categories ADD COLUMN IF NOT EXISTS tenant_id INTEGER NOT NULL DEFAULT 1;
        CREATE INDEX IF NOT EXISTS categories_tenant_idx ON categories(tenant_id);
      `)
      .catch(() => {});

    // Clean any duplicate categories if present
    await pgClient
      .query(
        `DELETE FROM categories a USING categories b
         WHERE a.id > b.id
           AND a.tenant_id = b.tenant_id
           AND LOWER(TRIM(a.name)) = LOWER(TRIM(b.name))`
      )
      .catch(() => {});

    // Keep strictly the 5 fixed pre-saved size-group footwear categories (Men, Women, Kids, Toddler, Infant) for every store
    await pgClient
      .query(
        `DELETE FROM categories
         WHERE tenant_id = $1
           AND LOWER(TRIM(name)) NOT IN ('men', 'women', 'kids', 'toddler', 'infant')`,
        [tenantId]
      )
      .catch(() => {});

    for (const stdCat of STANDARD_FOOTWEAR_CATEGORIES) {
      await pgClient
        .query(
          `INSERT INTO categories (tenant_id, name)
           SELECT $1, $2
           WHERE NOT EXISTS (
             SELECT 1 FROM categories WHERE tenant_id = $1 AND LOWER(TRIM(name)) = LOWER(TRIM($2))
           )`,
          [tenantId, stdCat]
        )
        .catch(() => {});
    }

    const result = await pgClient.query<any>(
      `SELECT DISTINCT ON (LOWER(TRIM(name))) id, name, created_at FROM categories
       WHERE tenant_id = $1
       ORDER BY LOWER(TRIM(name)), id ASC`,
      [tenantId]
    );

    // Order strictly: Men, Women, Kids, Toddler, Infant
    const orderMap: Record<string, number> = {
      men: 1,
      women: 2,
      kids: 3,
      toddler: 4,
      infant: 5,
    };

    const sorted = result.rows.sort((a, b) => {
      const aRank = orderMap[a.name.trim().toLowerCase()] || 99;
      const bRank = orderMap[b.name.trim().toLowerCase()] || 99;
      if (aRank !== bRank) return aRank - bRank;
      return a.name.localeCompare(b.name);
    });

    res.json({ categories: sorted });
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
