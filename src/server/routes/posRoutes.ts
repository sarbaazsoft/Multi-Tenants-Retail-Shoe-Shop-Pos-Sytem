import { Router } from 'express';
import type { Response } from 'express';
import bcrypt from 'bcryptjs';
import { pgClient } from '../../db/index.ts';
import { requireAuth } from '../auth.ts';
import type { AuthenticatedRequest } from '../auth.ts';
import { extractStrictTenantId } from '../../db/tenantDb.ts';

const router = Router();

// Helper to generate next unique invoice number scoped to tenant
async function generateInvoiceNumber(tenantId: number): Promise<string> {
  const settingsRes = await pgClient.query<{ invoice_prefix: string }>(
    'SELECT invoice_prefix FROM company_settings WHERE COALESCE(tenant_id, 1) = $1 LIMIT 1',
    [tenantId]
  );
  const prefix = settingsRes.rows[0]?.invoice_prefix || 'INV-';

  const lastSale = await pgClient.query<{ invoice_number: string }>(
    `SELECT invoice_number FROM sales WHERE COALESCE(tenant_id, 1) = $1 AND invoice_number LIKE $2 ORDER BY id DESC LIMIT 1`,
    [tenantId, `${prefix}%`]
  );

  let nextNum = 1;
  if (lastSale.rows.length > 0) {
    const rawNum = lastSale.rows[0].invoice_number.slice(prefix.length);
    const parsed = parseInt(rawNum, 10);
    if (!isNaN(parsed)) {
      nextNum = parsed + 1;
    }
  }

  const padded = String(nextNum).padStart(6, '0');
  return `${prefix}${padded}`;
}

// Helper to generate next unique return number scoped to tenant
async function generateReturnNumber(tenantId: number): Promise<string> {
  const lastRet = await pgClient.query<{ return_number: string }>(
    "SELECT return_number FROM returns WHERE COALESCE(tenant_id, 1) = $1 AND return_number LIKE 'RET-%' ORDER BY id DESC LIMIT 1",
    [tenantId]
  );
  let nextNum = 1;
  if (lastRet.rows.length > 0) {
    const rawNum = lastRet.rows[0].return_number.slice(4);
    const parsed = parseInt(rawNum, 10);
    if (!isNaN(parsed)) {
      nextNum = parsed + 1;
    }
  }
  const padded = String(nextNum).padStart(6, '0');
  return `RET-${padded}`;
}

// POST /api/pos/verify-override - Verify Store Admin credentials strictly scoped by tenant_id
router.post('/verify-override', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = extractStrictTenantId(req);
    const { email, password, pin } = req.body || {};
    const secret = String(password || pin || '').trim();
    if (!secret) {
      return res.status(400).json({ error: 'Admin password or PIN is required.' });
    }

    const adminQuery = email
      ? await pgClient.query<any>(
          `SELECT id, tenant_id, name, email, password_hash, role, status
           FROM users
           WHERE COALESCE(tenant_id, 1) = $2
             AND LOWER(email) = LOWER($1)
             AND role = 'ADMIN'
             AND status = 'APPROVED'`,
          [String(email).trim(), tenantId]
        )
      : await pgClient.query<any>(
          `SELECT id, tenant_id, name, email, password_hash, role, status
           FROM users
           WHERE COALESCE(tenant_id, 1) = $1
             AND role = 'ADMIN'
             AND status = 'APPROVED'`,
          [tenantId]
        );

    for (const adminRow of adminQuery.rows) {
      if (Number(adminRow.tenant_id || 1) !== tenantId) continue;
      if (await bcrypt.compare(secret, adminRow.password_hash)) {
        return res.json({
          verified: true,
          adminId: adminRow.id,
          tenantId,
          adminName: adminRow.name,
        });
      }
    }

    return res.status(403).json({
      verified: false,
      error: 'Invalid Store Admin credentials for this store.',
    });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to verify override credentials: ' + err.message });
  }
});

// POST /api/pos/checkout - Atomic Sale & Direct Shoe Exchange Processing (Strictly Scoped to req.user.tenantId)
router.post('/checkout', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = extractStrictTenantId(req);
  const {
    items = [],
    customerId = null,
    paymentMethod = 'CASH',
    cashReceived = 0,
    changeGiven = 0,
    notes = '',
    isMinPriceOverridden = false,
    adminOverrideEmail = null,
    adminOverridePassword = null,
    exchange = null,
    clientTxId = null,
    saleDate = null,
  } = req.body;

  if (clientTxId && typeof clientTxId === 'string') {
    const existingSync = await pgClient.query<any>(
      "SELECT id, invoice_number, total_amount FROM sales WHERE COALESCE(tenant_id, 1) = $1 AND notes LIKE $2 LIMIT 1",
      [tenantId, `%[Offline Tx: ${clientTxId.trim()}]%`]
    );
    if (existingSync.rows.length > 0) {
      const saleRow = existingSync.rows[0];
      return res.status(200).json({
        message: 'Sale previously synchronized.',
        invoiceNumber: saleRow.invoice_number,
        alreadySynced: true,
        sale: saleRow,
      });
    }
  }

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Cart is empty. Please add replacement shoes to checkout.' });
  }

  const user = req.user!;
  let verifiedOverrideAdminId: number | null = null;

  const settingsRes = await pgClient.query<{ pricing_mode: string }>(
    'SELECT pricing_mode FROM company_settings WHERE COALESCE(tenant_id, 1) = $1 LIMIT 1',
    [tenantId]
  );
  const isFixedMode = String(settingsRes.rows[0]?.pricing_mode || 'FIXED').toUpperCase() === 'FIXED';

  for (const item of items) {
    const prodRes = await pgClient.query<{
      cost_price: string;
      name: string;
      article: string;
      selling_price: number | null;
      min_price: number | null;
      max_price: number | null;
    }>(
      'SELECT COALESCE(cost_price, 0) as cost_price, name, article, COALESCE(selling_price, 0) as selling_price, COALESCE(min_price, 0) as min_price, COALESCE(max_price, 0) as max_price FROM products WHERE id = $1 AND COALESCE(tenant_id, 1) = $2',
      [item.productId, tenantId]
    );

    if (prodRes.rows.length === 0) {
      return res.status(404).json({ error: `Product ID ${item.productId} not found in your store.` });
    }

    const prod = prodRes.rows[0];
    const costPrice = Math.round(parseFloat(prod.cost_price || '0'));
    const prodIdentifier = prod.article || prod.name;
    const effectiveUnitPrice = Math.round(parseFloat(item.unitPrice));

    let minAllowedPrice = 0;
    if (isFixedMode) {
      minAllowedPrice = prod.selling_price && prod.selling_price > 0
        ? Math.round(Number(prod.selling_price))
        : costPrice;
    } else {
      minAllowedPrice = prod.min_price && prod.min_price > 0
        ? Math.round(Number(prod.min_price))
        : (prod.selling_price && prod.selling_price > 0 ? Math.round(Number(prod.selling_price)) : costPrice);
    }

    if (effectiveUnitPrice < minAllowedPrice) {
      if (user.role === 'ADMIN' || user.role === 'SUPERADMIN') {
        verifiedOverrideAdminId = user.id;
      } else if (isMinPriceOverridden && adminOverrideEmail && adminOverridePassword) {
        const adminCheck = await pgClient.query<any>(
          'SELECT id, password_hash, role, status FROM users WHERE LOWER(email) = LOWER($1) AND COALESCE(tenant_id, 1) = $2',
          [adminOverrideEmail.trim(), tenantId]
        );
        if (
          adminCheck.rows.length === 0 ||
          adminCheck.rows[0].role !== 'ADMIN' ||
          adminCheck.rows[0].status !== 'APPROVED'
        ) {
          return res.status(403).json({
            error: `Selling "${prodIdentifier}" below minimum price (Rs. ${minAllowedPrice}) is rejected. Invalid Admin credentials.`,
          });
        }
        const isPassValid = await bcrypt.compare(adminOverridePassword, adminCheck.rows[0].password_hash);
        if (!isPassValid) {
          return res.status(403).json({
            error: `Selling "${prodIdentifier}" below minimum price (Rs. ${minAllowedPrice}) is rejected. Incorrect Admin password.`,
          });
        }
        verifiedOverrideAdminId = adminCheck.rows[0].id;
      } else {
        return res.status(400).json({
          error: `Minimum Price Violation: "${prodIdentifier}" cannot be sold below saved minimum price of Rs. ${minAllowedPrice} without Admin authorization.`,
          requiresAdminOverride: true,
          productId: item.productId,
          productName: prodIdentifier,
          minSalePrice: minAllowedPrice,
          attemptedPrice: effectiveUnitPrice,
        });
      }
    }
  }

  await pgClient.query('BEGIN');

  try {
    const invoiceNumber = await generateInvoiceNumber(tenantId);
    let calculatedSubtotal = 0;
    let calculatedTotalDiscount = 0;

    let totalExchangeCredit = 0;
    let generatedReturnNumber: string | null = null;
    const validatedReturnItems: Array<{
      saleItemId: number;
      productId: number;
      productName: string;
      quantity: number;
      unitRefundPrice: number;
      subtotal: number;
      prevStock: number;
      newStock: number;
    }> = [];

    let origSale: any = null;
    if (exchange && exchange.originalSaleId && Array.isArray(exchange.items) && exchange.items.length > 0) {
      const origSaleRes = await pgClient.query('SELECT * FROM sales WHERE id = $1 AND COALESCE(tenant_id, 1) = $2', [exchange.originalSaleId, tenantId]);
      if (origSaleRes.rows.length === 0) {
        throw new Error('Original sale record for exchange not found in this store.');
      }
      origSale = origSaleRes.rows[0];

      for (const rItem of exchange.items) {
        const retQty = parseInt(rItem.quantity, 10);
        const refundPrice = parseFloat(rItem.unitRefundPrice);
        if (isNaN(retQty) || retQty <= 0) continue;

        const siRes = await pgClient.query<{ id: number; product_id: number; product_name: string; quantity: number }>(
          'SELECT id, product_id, product_name, quantity FROM sale_items WHERE id = $1 AND sale_id = $2',
          [rItem.saleItemId, exchange.originalSaleId]
        );
        if (siRes.rows.length === 0) {
          throw new Error(`Sale item ${rItem.saleItemId} does not match original invoice.`);
        }
        const saleItem = siRes.rows[0];

        const prevReturnsRes = await pgClient.query<{ total_returned: string }>(
          'SELECT COALESCE(SUM(quantity), 0) as total_returned FROM return_items WHERE sale_item_id = $1',
          [saleItem.id]
        );
        const alreadyReturned = parseInt(prevReturnsRes.rows[0].total_returned, 10);
        const maxReturnable = saleItem.quantity - alreadyReturned;

        if (retQty > maxReturnable) {
          throw new Error(
            `Cannot exchange ${retQty} of "${saleItem.product_name}". Maximum returnable is ${maxReturnable}.`
          );
        }

        const prodRes = await pgClient.query<{ id: number; total_stock: number }>(
          'SELECT id, total_stock FROM products WHERE id = $1 AND COALESCE(tenant_id, 1) = $2 FOR UPDATE',
          [saleItem.product_id, tenantId]
        );
        if (prodRes.rows.length === 0) {
          throw new Error(`Product ${saleItem.product_id} not found.`);
        }
        const prevStock = prodRes.rows[0].total_stock;
        const newStock = prevStock + retQty;
        const itemCredit = Math.round(retQty * refundPrice * 100) / 100;
        totalExchangeCredit += itemCredit;

        await pgClient.query('UPDATE products SET total_stock = $1, updated_at = NOW() WHERE id = $2 AND COALESCE(tenant_id, 1) = $3', [
          newStock,
          saleItem.product_id,
          tenantId,
        ]);

        validatedReturnItems.push({
          saleItemId: saleItem.id,
          productId: saleItem.product_id,
          productName: saleItem.product_name,
          quantity: retQty,
          unitRefundPrice: refundPrice,
          subtotal: itemCredit,
          prevStock,
          newStock,
        });
      }

      if (validatedReturnItems.length > 0) {
        generatedReturnNumber = await generateReturnNumber(tenantId);
        const returnRes = await pgClient.query<{ id: number }>(
          `INSERT INTO returns (
            tenant_id, return_number, original_sale_id, customer_id, return_date, 
            total_refund_amount, reason, created_by
          ) VALUES ($1, $2, $3, $4, NOW()::date::text, $5, $6, $7)
          RETURNING id`,
          [
            tenantId,
            generatedReturnNumber,
            origSale.id,
            customerId ? parseInt(customerId, 10) : origSale.customer_id,
            totalExchangeCredit,
            (exchange.reason || 'Direct Shoe Exchange at POS').trim(),
            user.id,
          ]
        );
        const returnId = returnRes.rows[0].id;

        for (const v of validatedReturnItems) {
          await pgClient.query(
            `INSERT INTO return_items (tenant_id, return_id, sale_item_id, product_id, quantity, unit_refund_price, subtotal)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [tenantId, returnId, v.saleItemId, v.productId, v.quantity, v.unitRefundPrice, v.subtotal]
          );

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
              generatedReturnNumber,
              user.id,
              `Direct Shoe Exchange for Invoice ${origSale.invoice_number}: ${exchange.reason || 'Size/style exchange'}`,
            ]
          );
        }
      }
    }

    const validatedItems: Array<{
      productId: number;
      productName: string;
      quantity: number;
      unitPrice: number;
      discount: number;
      subtotal: number;
      purchasePrice: number;
      prevStock: number;
      newStock: number;
    }> = [];

    for (const item of items) {
      const qty = parseInt(item.quantity, 10);
      const unitPrice = parseFloat(item.unitPrice);
      const discount = parseFloat(item.discount || 0);

      if (isNaN(qty) || qty <= 0) {
        throw new Error(`Invalid quantity (${qty}) for item.`);
      }

      const pRes = await pgClient.query<{
        id: number;
        name: string;
        article: string;
        total_stock: number;
        cost_price: string;
      }>('SELECT id, name, article, total_stock, COALESCE(cost_price, 0) as cost_price FROM products WHERE id = $1 AND COALESCE(tenant_id, 1) = $2 FOR UPDATE', [
        item.productId,
        tenantId,
      ]);

      if (pRes.rows.length === 0) {
        throw new Error(`Product ID ${item.productId} does not exist in your store.`);
      }

      const product = pRes.rows[0];
      const prodIdentifier = product.article || product.name;
      const prevStock = product.total_stock;

      if (prevStock < qty) {
        throw new Error(
          `Insufficient stock for "${prodIdentifier}". Available: ${prevStock}, Requested: ${qty}.`
        );
      }

      const newStock = prevStock - qty;
      const subtotal = unitPrice * qty - discount;
      calculatedSubtotal += unitPrice * qty;
      calculatedTotalDiscount += discount;

      await pgClient.query(
        'UPDATE products SET total_stock = $1, updated_at = NOW() WHERE id = $2 AND COALESCE(tenant_id, 1) = $3',
        [newStock, product.id, tenantId]
      );

      validatedItems.push({
        productId: product.id,
        productName: prodIdentifier,
        quantity: qty,
        unitPrice,
        discount,
        subtotal,
        purchasePrice: parseFloat(product.cost_price || '0'),
        prevStock,
        newStock,
      });
    }

    const netDifference = Math.round((calculatedSubtotal - calculatedTotalDiscount - totalExchangeCredit) * 100) / 100;
    const calculatedTotalAmount = Math.max(0, netDifference);
    const effectiveChangeGiven = netDifference < 0 ? Math.abs(netDifference) : (changeGiven || 0);
    const effectiveCashReceived = netDifference <= 0 ? 0 : (cashReceived || calculatedTotalAmount);

    let exchangeNote: string | null = null;
    if (validatedReturnItems.length > 0) {
      exchangeNote = `Direct Shoe Exchange against ${origSale?.invoice_number || exchange.originalInvoiceNumber} (Return ${generatedReturnNumber}). Returned Credit: Rs. ${Math.round(totalExchangeCredit)}. Net Difference: Rs. ${Math.round(netDifference)}`;
    }
    const offlineNote = clientTxId ? `[Offline Tx: ${clientTxId.trim()}]` : null;
    const finalNotes = [notes?.trim(), exchangeNote, offlineNote].filter(Boolean).join(' | ') || null;

    const effectiveSaleDate = saleDate && typeof saleDate === 'string' && /^\d{4}-\d{2}-\d{2}/.test(saleDate)
      ? saleDate.slice(0, 10)
      : null;

    const saleRes = await pgClient.query<{ id: number }>(
      `INSERT INTO sales (
        tenant_id, invoice_number, customer_id, sale_date, subtotal, discount, 
        total_amount, payment_method, cash_received, change_given, 
        created_by, is_min_price_overridden, overridden_by, notes
      ) VALUES ($1, $2, $3, COALESCE($14, NOW()::date::text), $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING id`,
      [
        tenantId,
        invoiceNumber,
        customerId ? parseInt(customerId, 10) : (origSale ? origSale.customer_id : null),
        calculatedSubtotal,
        calculatedTotalDiscount,
        calculatedTotalAmount,
        paymentMethod,
        effectiveCashReceived,
        effectiveChangeGiven,
        user.id,
        verifiedOverrideAdminId !== null,
        verifiedOverrideAdminId,
        finalNotes,
        effectiveSaleDate,
      ]
    );

    const saleId = saleRes.rows[0].id;

    for (const v of validatedItems) {
      await pgClient.query(
        `INSERT INTO sale_items (
          tenant_id, sale_id, product_id, product_name, quantity, unit_price, discount, subtotal, purchase_price
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [tenantId, saleId, v.productId, v.productName, v.quantity, v.unitPrice, v.discount, v.subtotal, v.purchasePrice]
      );

      await pgClient.query(
        `INSERT INTO stock_movements (
          tenant_id, product_id, qty_change, prev_stock, new_stock, movement_type, reference_id, user_id, notes
        ) VALUES ($1, $2, $3, $4, $5, 'SALE', $6, $7, $8)`,
        [
          tenantId,
          v.productId,
          -v.quantity,
          v.prevStock,
          v.newStock,
          invoiceNumber,
          user.id,
          `POS Sale Checkout (${invoiceNumber})`,
        ]
      );
    }

    await pgClient.query('COMMIT');

    const fullSale = await pgClient.query(
      `SELECT s.*, u.name as cashier_name, c.name as customer_name, c.phone as customer_phone
       FROM sales s
       LEFT JOIN users u ON s.created_by = u.id
       LEFT JOIN customers c ON s.customer_id = c.id
       WHERE s.id = $1 AND COALESCE(s.tenant_id, 1) = $2`,
      [saleId, tenantId]
    );

    const saleItemsRes = await pgClient.query(
      'SELECT * FROM sale_items WHERE sale_id = $1 ORDER BY id ASC',
      [saleId]
    );

    const csRes = await pgClient.query('SELECT * FROM company_settings WHERE COALESCE(tenant_id, 1) = $1 LIMIT 1', [tenantId]);

    res.status(201).json({
      message: validatedReturnItems.length > 0
        ? `Direct Shoe Exchange completed. Return ${generatedReturnNumber} generated.`
        : 'Sale completed successfully.',
      invoiceNumber,
      returnNumber: generatedReturnNumber,
      clientTxId: clientTxId || null,
      netDifference,
      exchangeCredit: totalExchangeCredit,
      sale: {
        ...(fullSale.rows[0] as any),
        items: saleItemsRes.rows,
        returned_items: validatedReturnItems,
        exchange_credit: totalExchangeCredit,
        net_difference: netDifference,
        return_number: generatedReturnNumber,
        original_invoice_number: origSale?.invoice_number || exchange?.originalInvoiceNumber,
      },
      companySettings: csRes.rows[0] || null,
    });
  } catch (txErr: any) {
    await pgClient.query('ROLLBACK');
    console.error('POS Checkout Transaction Failed:', txErr);
    res.status(400).json({ error: txErr.message || 'Transaction failed. Stock has been preserved.' });
  }
});

// GET /api/pos/sales - List sales scoped strictly by req.user.tenantId
router.get('/sales', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = extractStrictTenantId(req);
    const { search, limit = 50 } = req.query;
    let query = `
      SELECT s.id, s.invoice_number, s.customer_id, c.name as customer_name, 
             s.sale_date, s.subtotal, s.discount, s.total_amount, 
             s.payment_method, s.cash_received, s.change_given, 
             s.created_by, u.name as cashier_name, s.is_min_price_overridden,
             s.notes, s.created_at
      FROM sales s
      LEFT JOIN customers c ON s.customer_id = c.id AND COALESCE(c.tenant_id, 1) = $1
      LEFT JOIN users u ON s.created_by = u.id
      WHERE COALESCE(s.tenant_id, 1) = $1
    `;
    const params: any[] = [tenantId];

    if (search && typeof search === 'string') {
      params.push(`%${search.trim().toLowerCase()}%`);
      query += ` AND (LOWER(s.invoice_number) LIKE $${params.length} OR LOWER(c.name) LIKE $${params.length} OR c.phone LIKE $${params.length})`;
    }

    query += ` ORDER BY s.id DESC LIMIT $${params.length + 1}`;
    params.push(parseInt(String(limit), 10) || 50);

    const result = await pgClient.query(query, params);
    res.json({ sales: result.rows });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to fetch sales: ' + err.message });
  }
});

// GET /api/pos/sales/:id - Single Sale Details scoped strictly by req.user.tenantId
router.get('/sales/:id', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = extractStrictTenantId(req);
    const id = parseInt(req.params.id, 10);
    const saleRes = await pgClient.query(
      `SELECT s.*, u.name as cashier_name, c.name as customer_name, c.phone as customer_phone, c.address as customer_address
       FROM sales s
       LEFT JOIN users u ON s.created_by = u.id
       LEFT JOIN customers c ON s.customer_id = c.id AND COALESCE(c.tenant_id, 1) = $2
       WHERE s.id = $1 AND COALESCE(s.tenant_id, 1) = $2`,
      [id, tenantId]
    );

    if (saleRes.rows.length === 0) {
      return res.status(404).json({ error: 'Sale record not found in your store.' });
    }

    const itemsRes = await pgClient.query(
      `SELECT si.id, si.product_id, COALESCE(p.article, si.product_name) as article, COALESCE(p.article, si.product_name) as product_name, si.quantity, si.unit_price, si.discount, si.subtotal, si.purchase_price 
       FROM sale_items si
       LEFT JOIN products p ON si.product_id = p.id
       WHERE si.sale_id = $1 ORDER BY si.id ASC`,
      [id]
    );

    const settingsRes = await pgClient.query('SELECT * FROM company_settings WHERE COALESCE(tenant_id, 1) = $1 LIMIT 1', [tenantId]);

    res.json({
      sale: {
        ...(saleRes.rows[0] as any),
        items: itemsRes.rows,
      },
      companySettings: settingsRes.rows[0] || null,
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to fetch sale details: ' + err.message });
  }
});

export default router;
