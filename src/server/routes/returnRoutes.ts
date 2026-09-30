import { Router } from 'express';
import type { Response } from 'express';
import { pgClient } from '../../db/index.ts';
import { requireAuth } from '../auth.ts';
import type { AuthenticatedRequest } from '../auth.ts';
import { extractStrictTenantId } from '../../db/tenantDb.ts';

const router = Router();

// Helper to generate unique return number scoped to tenant
async function generateReturnNumber(tenantId: number): Promise<string> {
  const lastRet = await pgClient.query<{ return_number: string }>(
    "SELECT return_number FROM returns WHERE tenant_id = $1 AND return_number LIKE 'RET-%' ORDER BY id DESC LIMIT 1",
    [tenantId]
  );

  let nextNum = 1;
  if (lastRet.rows.length > 0) {
    const rawNum = lastRet.rows[0].return_number.replace(/^RET-(?:T\d+-)?/, '');
    const parsed = parseInt(rawNum, 10);
    if (!isNaN(parsed)) {
      nextNum = parsed + 1;
    }
  }

  const padded = String(nextNum).padStart(6, '0');
  return tenantId === 1 ? `RET-${padded}` : `RET-T${tenantId}-${padded}`;
}

// Verify Invoice for Return - Returns sale details with already returned & returnable quantities
router.get('/verify-invoice/:invoiceNumber', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = extractStrictTenantId(req);
    const invoiceNumber = req.params.invoiceNumber.trim();

    const saleRes = await pgClient.query(
      `SELECT s.*, c.name as customer_name, c.phone as customer_phone, u.name as cashier_name
       FROM sales s
       LEFT JOIN customers c ON s.customer_id = c.id AND c.tenant_id = $2
       LEFT JOIN users u ON s.user_id = u.id
       WHERE UPPER(s.invoice_number) = UPPER($1) AND s.tenant_id = $2`,
      [invoiceNumber, tenantId]
    );

    if (saleRes.rows.length === 0) {
      return res.status(404).json({ error: `Invoice "${invoiceNumber}" not found in this store.` });
    }

    const sale: any = saleRes.rows[0];

    // Fetch sale items with already returned quantities
    const itemsRes = await pgClient.query(
      `SELECT si.*, 
              COALESCE(p.article, si.product_name) as article,
              COALESCE(p.article, si.product_name) as product_name,
              p.sku as product_sku,
              p.barcode as barcode,
              COALESCE(SUM(ri.quantity), 0)::int as already_returned_quantity
       FROM sale_items si
       LEFT JOIN products p ON si.product_id = p.id AND p.tenant_id = $2
       LEFT JOIN return_items ri ON si.id = ri.sale_item_id AND ri.tenant_id = $2
       WHERE si.sale_id = $1 AND si.tenant_id = $2
       GROUP BY si.id, p.article, p.name, p.sku, p.barcode
       ORDER BY si.id ASC`,
      [sale.id, tenantId]
    );

    const items = itemsRes.rows.map((item: any) => {
      const soldQty = Number(item.quantity) || 0;
      const returnedQty = Number(item.already_returned_quantity) || 0;
      const returnableQty = Math.max(0, soldQty - returnedQty);
      const unitPrice = parseFloat(item.unit_price) || 0;
      const discount = parseFloat(item.discount) || 0;
      const subtotal = parseFloat(item.subtotal) || 0;
      const effectiveUnitPrice = soldQty > 0 ? (subtotal - discount) / soldQty : unitPrice;

      return {
        id: item.id,
        productId: item.product_id,
        product_id: item.product_id,
        article: item.article || item.product_name,
        productName: item.article || item.product_name,
        product_name: item.article || item.product_name,
        sku: item.product_sku || '',
        product_sku: item.product_sku || '',
        barcode: item.barcode || '',
        quantity: soldQty,
        soldQuantity: soldQty,
        already_returned_qty: returnedQty,
        alreadyReturnedQuantity: returnedQty,
        returnableQuantity: returnableQty,
        unit_price: unitPrice,
        unitPrice,
        discount,
        effectiveUnitPrice,
        subtotal,
      };
    });

    res.json({
      sale: {
        id: sale.id,
        invoiceNumber: sale.invoice_number,
        invoice_number: sale.invoice_number,
        saleDate: sale.sale_date,
        sale_date: sale.sale_date,
        totalAmount: parseFloat(sale.total_amount) || 0,
        total_amount: parseFloat(sale.total_amount) || 0,
        customerName: sale.customer_name || 'Walk-in Customer',
        customer_name: sale.customer_name || 'Walk-in Customer',
        customerPhone: sale.customer_phone || '-',
        customer_phone: sale.customer_phone || '-',
        customerId: sale.customer_id || null,
        customer_id: sale.customer_id || null,
        cashierName: sale.cashier_name || 'Counter',
        cashier_name: sale.cashier_name || 'Counter',
        items,
      },
      items,
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to verify invoice: ' + err.message });
  }
});

// Process Sales Return (Atomic Stock Restoration + Ledger Recording)
router.post('/', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = extractStrictTenantId(req);
  const {
    originalSaleId: rawOriginalSaleId,
    saleId: rawSaleId,
    reason,
    items = [], // [{ saleItemId, productId, quantity, unitRefundPrice }]
  } = req.body;
  const originalSaleId = rawOriginalSaleId || rawSaleId;

  if (!originalSaleId) {
    return res.status(400).json({ error: 'Original sale ID is required.' });
  }
  if (!reason || !reason.trim()) {
    return res.status(400).json({ error: 'Return reason is required.' });
  }
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'At least one item must be selected for return.' });
  }

  await pgClient.query('BEGIN');

  try {
    // Check original sale scoped to tenant
    const saleRes = await pgClient.query('SELECT * FROM sales WHERE id = $1 AND tenant_id = $2', [originalSaleId, tenantId]);
    if (saleRes.rows.length === 0) {
      throw new Error('Original sale record does not exist in this store.');
    }
    const sale: any = saleRes.rows[0];

    const returnNumber = await generateReturnNumber(tenantId);
    let totalRefundAmount = 0;

    const validatedItems: Array<{
      saleItemId: number;
      productId: number;
      productName: string;
      quantity: number;
      unitRefundPrice: number;
      subtotal: number;
      prevStock: number;
      newStock: number;
    }> = [];

    for (const item of items) {
      const returnQty = parseInt(item.quantity, 10);

      if (isNaN(returnQty) || returnQty <= 0) {
        continue; // skip zero items
      }

      // Lock sale item and check returnable qty
      const siRes = await pgClient.query<{
        id: number;
        product_id: number;
        product_name: string;
        quantity: number;
        unit_price: string;
        discount: string;
        subtotal: string;
      }>('SELECT id, product_id, product_name, quantity, unit_price, discount, subtotal FROM sale_items WHERE id = $1 AND sale_id = $2 AND tenant_id = $3', [
        item.saleItemId,
        originalSaleId,
        tenantId,
      ]);

      if (siRes.rows.length === 0) {
        throw new Error(`Sale item ${item.saleItemId} does not match original sale.`);
      }

      const saleItem = siRes.rows[0];
      const parsedRefundPrice = parseFloat(item.unitRefundPrice);
      const fallbackUnitPrice =
        saleItem.quantity > 0
          ? (parseFloat(saleItem.subtotal || '0') - parseFloat(saleItem.discount || '0')) / saleItem.quantity
          : parseFloat(saleItem.unit_price || '0');
      const refundPrice = !isNaN(parsedRefundPrice) && parsedRefundPrice >= 0 ? parsedRefundPrice : fallbackUnitPrice;

      // Check already returned qty
      const prevReturnsRes = await pgClient.query<{ total_returned: string }>(
        'SELECT COALESCE(SUM(quantity), 0) as total_returned FROM return_items WHERE sale_item_id = $1 AND tenant_id = $2',
        [saleItem.id, tenantId]
      );
      const alreadyReturned = parseInt(prevReturnsRes.rows[0].total_returned, 10);
      const maxReturnable = saleItem.quantity - alreadyReturned;

      if (returnQty > maxReturnable) {
        throw new Error(
          `Cannot return ${returnQty} of "${saleItem.product_name}". Maximum returnable is ${maxReturnable}.`
        );
      }

      // Lock product row and increment stock
      const prodRes = await pgClient.query<{ id: number; total_stock: number }>(
        'SELECT id, total_stock FROM products WHERE id = $1 AND tenant_id = $2 FOR UPDATE',
        [saleItem.product_id, tenantId]
      );
      const prevStock = prodRes.rows[0].total_stock;
      const newStock = prevStock + returnQty;
      const subtotal = returnQty * refundPrice;
      totalRefundAmount += subtotal;

      await pgClient.query('UPDATE products SET total_stock = $1, updated_at = NOW() WHERE id = $2 AND tenant_id = $3', [
        newStock,
        saleItem.product_id,
        tenantId,
      ]);

      validatedItems.push({
        saleItemId: saleItem.id,
        productId: saleItem.product_id,
        productName: saleItem.product_name,
        quantity: returnQty,
        unitRefundPrice: refundPrice,
        subtotal,
        prevStock,
        newStock,
      });
    }

    if (validatedItems.length === 0) {
      throw new Error('No valid items to return.');
    }

    // Insert returns header
    const returnRes = await pgClient.query<{ id: number }>(
      `INSERT INTO returns (
        tenant_id, return_number, original_sale_id, customer_id, return_date, 
        total_refund_amount, reason, created_by
      ) VALUES ($1, $2, $3, $4, NOW()::date::text, $5, $6, $7)
      RETURNING id`,
      [
        tenantId,
        returnNumber,
        originalSaleId,
        sale.customer_id,
        totalRefundAmount,
        reason.trim(),
        req.user!.id,
      ]
    );

    const returnId = returnRes.rows[0].id;

    for (const v of validatedItems) {
      await pgClient.query(
        `INSERT INTO return_items (tenant_id, return_id, sale_item_id, product_id, quantity, unit_refund_price, subtotal)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [tenantId, returnId, v.saleItemId, v.productId, v.quantity, v.unitRefundPrice, v.subtotal]
      );

      // Record in Stock Movement Ledger
      await pgClient.query(
        `INSERT INTO stock_movements (
          tenant_id, product_id, qty_change, prev_stock, new_stock, movement_type, reference_id, user_id, notes
        ) VALUES ($1, $2, $3, $4, $5, 'SALE_RETURN', $6, $7, $8)`,
        [
          tenantId,
          v.productId,
          v.quantity,
          v.prevStock,
          v.newStock,
          returnNumber,
          req.user!.id,
          `Customer return for Invoice ${sale.invoice_number}: ${reason.trim()}`,
        ]
      );
    }

    await pgClient.query('COMMIT');

    res.status(201).json({
      message: 'Return processed and stock restored to inventory.',
      returnNumber,
      returnId,
      totalRefundAmount,
    });
  } catch (err: any) {
    await pgClient.query('ROLLBACK');
    console.error('Return transaction error:', err);
    res.status(400).json({ error: err.message || 'Failed to process return.' });
  }
});

// List Returns
router.get('/', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = extractStrictTenantId(req);
    const { search } = req.query;
    let query = `
      SELECT r.*, s.invoice_number, c.name as customer_name, u.name as cashier_name
      FROM returns r
      JOIN sales s ON r.original_sale_id = s.id AND s.tenant_id = $1
      LEFT JOIN customers c ON r.customer_id = c.id AND c.tenant_id = $1
      LEFT JOIN users u ON r.created_by = u.id
      WHERE r.tenant_id = $1
    `;
    const params: any[] = [tenantId];

    if (search && typeof search === 'string') {
      params.push(`%${search.trim().toLowerCase()}%`);
      query += ` AND (LOWER(r.return_number) LIKE $${params.length} OR LOWER(s.invoice_number) LIKE $${params.length})`;
    }

    query += ` ORDER BY r.id DESC`;

    const result = await pgClient.query(query, params);
    res.json({ returns: result.rows });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to fetch returns: ' + err.message });
  }
});

// Single Return Details
router.get('/:id', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = extractStrictTenantId(req);
    const id = parseInt(req.params.id, 10);
    const returnRes = await pgClient.query(
      `SELECT r.*, s.invoice_number, c.name as customer_name, u.name as cashier_name
       FROM returns r
       JOIN sales s ON r.original_sale_id = s.id AND s.tenant_id = $2
       LEFT JOIN customers c ON r.customer_id = c.id AND c.tenant_id = $2
       LEFT JOIN users u ON r.created_by = u.id
       WHERE r.id = $1 AND r.tenant_id = $2`,
      [id, tenantId]
    );

    if (returnRes.rows.length === 0) {
      return res.status(404).json({ error: 'Return record not found.' });
    }

    const itemsRes = await pgClient.query(
      `SELECT ri.*, COALESCE(p.article, p.name) as article, COALESCE(p.article, p.name) as product_name, p.sku, p.barcode
       FROM return_items ri
       JOIN products p ON ri.product_id = p.id AND p.tenant_id = $2
       WHERE ri.return_id = $1 AND ri.tenant_id = $2`,
      [id, tenantId]
    );

    res.json({
      returnRecord: {
        ...(returnRes.rows[0] as any),
        items: itemsRes.rows,
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to fetch return details: ' + err.message });
  }
});

export default router;
