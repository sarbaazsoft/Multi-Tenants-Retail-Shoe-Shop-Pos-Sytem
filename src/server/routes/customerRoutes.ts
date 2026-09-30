import { Router } from 'express';
import type { Response } from 'express';
import { requireAuth } from '../auth.ts';
import type { AuthenticatedRequest } from '../auth.ts';
import { getTenantDb } from '../../db/tenantDb.ts';

const router = Router();

// List / Search Customers (Strictly scoped to req.user.tenantId)
router.get('/', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantDb = getTenantDb(req);
    const search = typeof req.query.search === 'string' ? req.query.search : undefined;
    const customers = await tenantDb.customers.findMany(search);
    res.json({ customers });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to fetch customers: ' + err.message });
  }
});

// Single Customer with recent purchase history (Strictly scoped to req.user.tenantId)
router.get('/:id', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantDb = getTenantDb(req);
    const id = parseInt(req.params.id, 10);
    const data = await tenantDb.customers.findById(id);
    if (!data) {
      return res.status(404).json({ error: 'Customer not found in this store.' });
    }
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to fetch customer: ' + err.message });
  }
});

// Create Customer (Strictly scoped to req.user.tenantId)
router.post('/', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantDb = getTenantDb(req);
    const { name, phone, email = '', address = '', notes = '' } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Customer name is required.' });
    }
    if (!phone || !phone.trim()) {
      return res.status(400).json({ error: 'Customer phone number is required.' });
    }

    const customer = await tenantDb.customers.create({ name, phone, email, address, notes });
    res.status(201).json({ customer, message: 'Customer created successfully.' });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to create customer: ' + err.message });
  }
});

// Update Customer (Strictly scoped to req.user.tenantId)
router.put('/:id', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantDb = getTenantDb(req);
    const id = parseInt(req.params.id, 10);
    const { name, phone, email = '', address = '', notes = '' } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Customer name is required.' });
    }
    if (!phone || !phone.trim()) {
      return res.status(400).json({ error: 'Customer phone is required.' });
    }

    const customer = await tenantDb.customers.update(id, { name, phone, email, address, notes });
    if (!customer) {
      return res.status(404).json({ error: 'Customer not found in this store.' });
    }

    res.json({ customer, message: 'Customer updated successfully.' });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to update customer: ' + err.message });
  }
});

// Delete Customer (Strictly scoped to req.user.tenantId)
router.delete('/:id', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantDb = getTenantDb(req);
    const id = parseInt(req.params.id, 10);
    const deleted = await tenantDb.customers.delete(id);
    if (!deleted) {
      return res.status(404).json({ error: 'Customer not found in this store.' });
    }
    res.json({ message: 'Customer deleted successfully.' });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to delete customer: ' + err.message });
  }
});

export default router;
