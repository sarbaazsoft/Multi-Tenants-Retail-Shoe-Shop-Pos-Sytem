import { Router } from 'express';
import type { Response } from 'express';
import { requireAuth, requireAdmin } from '../auth.ts';
import type { AuthenticatedRequest } from '../auth.ts';
import { getTenantDb } from '../../db/tenantDb.ts';

const router = Router();

// GET /api/inventory/ledger - Stock Movements Audit Trail (Strictly scoped to req.user.tenantId)
router.get('/ledger', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantDb = getTenantDb(req);
    const { productId, movementType, limit = 100 } = req.query;
    const movements = await tenantDb.inventory.getLedger({
      productId: productId ? Number(productId) : undefined,
      movementType: typeof movementType === 'string' ? movementType : undefined,
      limit: Number(limit) || 100,
    });
    res.json({ movements });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to fetch stock movements: ' + err.message });
  }
});

// POST /api/inventory/adjust - Manual Stock Adjustment (Admin Only, Strictly scoped to req.user.tenantId)
router.post('/adjust', requireAuth, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantDb = getTenantDb(req);
    const { productId, newStock, notes } = req.body;

    if (!productId) {
      return res.status(400).json({ error: 'Product ID is required.' });
    }
    if (newStock === undefined || isNaN(Number(newStock)) || Number(newStock) < 0) {
      return res.status(400).json({ error: 'Valid non-negative new stock count is required.' });
    }
    if (!notes || !notes.trim()) {
      return res.status(400).json({ error: 'Audit reason/notes is required for manual stock adjustment.' });
    }

    const targetStock = parseInt(newStock, 10);
    const result = await tenantDb.inventory.adjustStock({
      productId: Number(productId),
      newStock: targetStock,
      notes: notes.trim(),
      userId: req.user!.id,
    });

    const prodIdentifier = result.product.article || result.product.name;
    res.json({
      message: `Stock for "${prodIdentifier}" successfully adjusted from ${result.prevStock} to ${result.newStock}.`,
      prevStock: result.prevStock,
      newStock: result.newStock,
      qtyChange: result.qtyChange,
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to adjust stock.' });
  }
});

export default router;
