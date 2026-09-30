import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { pgClient } from './index.ts';

let saasControlPlaneInitialized = false;

/**
 * Generates an alphanumeric App Key in the format APP-KEY-XXXX-XXXX
 */
export function generateAppKey(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.randomBytes(8);
  let part1 = '';
  let part2 = '';
  for (let i = 0; i < 4; i++) {
    part1 += chars[bytes[i] % chars.length];
    part2 += chars[bytes[i + 4] % chars.length];
  }
  return `APP-KEY-${part1}-${part2}`;
}

/**
 * Generates a guaranteed unique App Key verified against the tenants table
 */
export async function generateUniqueAppKey(): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const candidate = generateAppKey();
    const existing = await pgClient
      .query('SELECT id FROM tenants WHERE app_key = $1 LIMIT 1', [candidate])
      .catch(() => ({ rows: [] }));
    if (existing.rows.length === 0) {
      return candidate;
    }
  }
  return `APP-KEY-${crypto.randomBytes(2).toString('hex').toUpperCase()}-${Date.now().toString(36).slice(-4).toUpperCase()}`;
}

/**
 * Normalizes subscription plan to '6_MONTHS' or 'YEARLY'
 */
export function normalizeSubscriptionPlan(plan?: string | null): '6_MONTHS' | 'YEARLY' {
  const clean = String(plan || '').trim().toUpperCase().replace(/\s+/g, '_');
  if (clean === '6_MONTHS' || clean === '6_MONTH' || clean === 'SIX_MONTHS') {
    return '6_MONTHS';
  }
  return 'YEARLY';
}

/**
 * Calculates subscriptionEndDate automatically based on plan ('6_MONTHS' => +6 months, 'YEARLY' => +1 year)
 */
export function calculateSubscriptionEndDate(
  plan: '6_MONTHS' | 'YEARLY' | string,
  startDate: Date = new Date()
): Date {
  const normalized = normalizeSubscriptionPlan(plan);
  const end = new Date(startDate.getTime());
  if (normalized === '6_MONTHS') {
    end.setMonth(end.getMonth() + 6);
  } else {
    end.setFullYear(end.getFullYear() + 1);
  }
  return end;
}

/**
 * Synchronizes expired subscriptions in PostgreSQL so any tenant whose subscription_end_date < NOW()
 * is automatically marked with subscription_status = 'EXPIRED'.
 */
export async function syncExpiredTenantSubscriptions(): Promise<void> {
  try {
    await pgClient.query(`
      UPDATE tenants
      SET subscription_status = 'EXPIRED',
          updated_at = NOW()
      WHERE subscription_end_date IS NOT NULL
        AND subscription_end_date < NOW()
        AND subscription_status NOT IN ('EXPIRED', 'SUSPENDED')
    `);
  } catch {}
}

/**
 * Ensures that all database tables, columns, constraints, and multi-tenant discriminators exist.
 * Idempotent and safe for both PGlite and standard PostgreSQL.
 */
export async function ensureDatabaseSchema(): Promise<void> {
  await pgClient.waitReady;

  // Migrate any legacy TEXT/VARCHAR tenants.id or tenant_id columns to INTEGER before DDL
  await pgClient.exec(`
    DO $$
    DECLARE
      fk RECORD;
      tbl RECORD;
    BEGIN
      -- 1. Drop any foreign key constraints on tenant_id / provisioned_tenant_id or referencing tenants
      FOR fk IN
        SELECT DISTINCT tc.table_name, tc.constraint_name
        FROM information_schema.table_constraints tc
        LEFT JOIN information_schema.key_column_usage kcu
          ON tc.constraint_name = kcu.constraint_name
          AND tc.table_schema = kcu.table_schema
        LEFT JOIN information_schema.constraint_column_usage ccu
          ON tc.constraint_name = ccu.constraint_name
          AND tc.table_schema = ccu.table_schema
        WHERE tc.table_schema = 'public'
          AND tc.constraint_type = 'FOREIGN KEY'
          AND (kcu.column_name IN ('tenant_id', 'provisioned_tenant_id') OR ccu.table_name = 'tenants')
      LOOP
        EXECUTE format('ALTER TABLE %I DROP CONSTRAINT IF EXISTS %I CASCADE', fk.table_name, fk.constraint_name);
      END LOOP;

      -- 2. If tenants.id is not integer (e.g., legacy 'default-store-id' text), drop and recreate with SERIAL PRIMARY KEY
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'tenants' AND column_name = 'id' AND data_type != 'integer'
      ) THEN
        DROP TABLE IF EXISTS store_requests CASCADE;
        DROP TABLE IF EXISTS tenants CASCADE;
      END IF;

      -- 3. If store_requests.provisioned_tenant_id is not integer, drop store_requests so it is recreated cleanly
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'store_requests' AND column_name = 'provisioned_tenant_id' AND data_type != 'integer'
      ) THEN
        DROP TABLE IF EXISTS store_requests CASCADE;
      END IF;

      -- 4. Convert any non-integer tenant_id column across all tables to INTEGER NOT NULL DEFAULT 1
      FOR tbl IN
        SELECT table_name
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND column_name = 'tenant_id'
          AND data_type != 'integer'
      LOOP
        EXECUTE format('ALTER TABLE %I ALTER COLUMN tenant_id DROP DEFAULT', tbl.table_name);
        EXECUTE format(
          'ALTER TABLE %I ALTER COLUMN tenant_id TYPE INTEGER USING (CASE WHEN tenant_id IS NOT NULL AND TRIM(tenant_id::text) ~ ''^[0-9]+$'' THEN TRIM(tenant_id::text)::integer ELSE 1 END)',
          tbl.table_name
        );
        EXECUTE format('UPDATE %I SET tenant_id = 1 WHERE tenant_id IS NULL OR tenant_id <= 0', tbl.table_name);
        EXECUTE format('ALTER TABLE %I ALTER COLUMN tenant_id SET DEFAULT 1', tbl.table_name);
        EXECUTE format('ALTER TABLE %I ALTER COLUMN tenant_id SET NOT NULL', tbl.table_name);
      END LOOP;

      -- 5. Ensure any existing integer tenant_id columns have no NULL values and default to 1
      FOR tbl IN
        SELECT table_name
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND column_name = 'tenant_id'
          AND data_type = 'integer'
      LOOP
        EXECUTE format('UPDATE %I SET tenant_id = 1 WHERE tenant_id IS NULL OR tenant_id <= 0', tbl.table_name);
        EXECUTE format('ALTER TABLE %I ALTER COLUMN tenant_id SET DEFAULT 1', tbl.table_name);
      END LOOP;
    END $$;
  `);

  await pgClient.exec(`
    CREATE TABLE IF NOT EXISTS tenants (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL DEFAULT 'ACTIVE',
      app_key TEXT UNIQUE,
      subscription_plan TEXT NOT NULL DEFAULT 'YEARLY',
      subscription_start_date TIMESTAMP NOT NULL DEFAULT NOW(),
      subscription_end_date TIMESTAMP NOT NULL DEFAULT (NOW() + INTERVAL '1 year'),
      subscription_status TEXT NOT NULL DEFAULT 'ACTIVE',
      theme_color TEXT NOT NULL DEFAULT '#2563EB',
      background_color TEXT NOT NULL DEFAULT '#ffffff',
      logo_url TEXT DEFAULT '',
      owner_name TEXT DEFAULT '',
      owner_email TEXT DEFAULT '',
      owner_phone TEXT DEFAULT '',
      business_address TEXT DEFAULT '',
      address TEXT DEFAULT '',
      tax_id TEXT DEFAULT '',
      currency TEXT NOT NULL DEFAULT 'PKR',
      currency_symbol TEXT NOT NULL DEFAULT 'Rs.',
      plan TEXT NOT NULL DEFAULT 'PRO',
      is_onboarded BOOLEAN NOT NULL DEFAULT false,
      onboarding_completed BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    );

    ALTER TABLE tenants ADD COLUMN IF NOT EXISTS app_key TEXT;
    ALTER TABLE tenants ADD COLUMN IF NOT EXISTS subscription_plan TEXT NOT NULL DEFAULT 'YEARLY';
    ALTER TABLE tenants ADD COLUMN IF NOT EXISTS subscription_start_date TIMESTAMP NOT NULL DEFAULT NOW();
    ALTER TABLE tenants ADD COLUMN IF NOT EXISTS subscription_end_date TIMESTAMP NOT NULL DEFAULT (NOW() + INTERVAL '1 year');
    ALTER TABLE tenants ADD COLUMN IF NOT EXISTS subscription_status TEXT NOT NULL DEFAULT 'ACTIVE';
    ALTER TABLE tenants ADD COLUMN IF NOT EXISTS background_color TEXT NOT NULL DEFAULT '#ffffff';
    ALTER TABLE tenants ADD COLUMN IF NOT EXISTS logo_url TEXT DEFAULT '';
    ALTER TABLE tenants ADD COLUMN IF NOT EXISTS owner_name TEXT DEFAULT '';
    ALTER TABLE tenants ADD COLUMN IF NOT EXISTS owner_email TEXT DEFAULT '';
    ALTER TABLE tenants ADD COLUMN IF NOT EXISTS owner_phone TEXT DEFAULT '';
    ALTER TABLE tenants ADD COLUMN IF NOT EXISTS address TEXT DEFAULT '';
    ALTER TABLE tenants ADD COLUMN IF NOT EXISTS business_address TEXT DEFAULT '';
    ALTER TABLE tenants ADD COLUMN IF NOT EXISTS tax_id TEXT DEFAULT '';
    ALTER TABLE tenants ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'PKR';
    ALTER TABLE tenants ADD COLUMN IF NOT EXISTS currency_symbol TEXT NOT NULL DEFAULT 'Rs.';
    ALTER TABLE tenants ADD COLUMN IF NOT EXISTS plan TEXT NOT NULL DEFAULT 'PRO';
    ALTER TABLE tenants ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN NOT NULL DEFAULT false;
    ALTER TABLE tenants ADD COLUMN IF NOT EXISTS is_onboarded BOOLEAN NOT NULL DEFAULT false;
    CREATE INDEX IF NOT EXISTS tenants_slug_idx ON tenants(slug);
    CREATE INDEX IF NOT EXISTS tenants_status_idx ON tenants(status);
    CREATE UNIQUE INDEX IF NOT EXISTS tenants_app_key_idx ON tenants(app_key);
    CREATE INDEX IF NOT EXISTS tenants_subscription_status_idx ON tenants(subscription_status);

    CREATE TABLE IF NOT EXISTS store_requests (
      id SERIAL PRIMARY KEY,
      store_name TEXT NOT NULL,
      requested_slug TEXT NOT NULL,
      owner_name TEXT NOT NULL,
      owner_email TEXT NOT NULL,
      owner_phone TEXT DEFAULT '',
      business_address TEXT DEFAULT '',
      plan TEXT NOT NULL DEFAULT 'PRO',
      request_type TEXT NOT NULL DEFAULT 'NEW_STORE',
      notes TEXT DEFAULT '',
      status TEXT NOT NULL DEFAULT 'PENDING',
      provisioned_tenant_id INTEGER REFERENCES tenants(id) ON DELETE SET NULL,
      initial_password TEXT DEFAULT '',
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    );

    ALTER TABLE store_requests ADD COLUMN IF NOT EXISTS request_type TEXT NOT NULL DEFAULT 'NEW_STORE';
    ALTER TABLE store_requests ADD COLUMN IF NOT EXISTS notes TEXT DEFAULT '';
    ALTER TABLE store_requests ADD COLUMN IF NOT EXISTS provisioned_tenant_id INTEGER;

    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      tenant_id INTEGER NOT NULL DEFAULT 1,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      phone TEXT DEFAULT '',
      avatar_url TEXT DEFAULT '',
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'CASHIER',
      status TEXT NOT NULL DEFAULT 'PENDING',
      active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    );

    ALTER TABLE users ADD COLUMN IF NOT EXISTS tenant_id INTEGER NOT NULL DEFAULT 1;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS phone TEXT DEFAULT '';
    ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT DEFAULT '';
    ALTER TABLE users ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT true;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS quick_password TEXT DEFAULT '';
    ALTER TABLE users DROP CONSTRAINT IF EXISTS users_email_key;
    CREATE INDEX IF NOT EXISTS users_tenant_idx ON users(tenant_id);

    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id SERIAL PRIMARY KEY,
      tenant_id INTEGER NOT NULL DEFAULT 1,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token TEXT NOT NULL UNIQUE,
      expires_at TIMESTAMP NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
    ALTER TABLE password_reset_tokens ADD COLUMN IF NOT EXISTS tenant_id INTEGER NOT NULL DEFAULT 1;

    CREATE TABLE IF NOT EXISTS company_settings (
      id SERIAL PRIMARY KEY,
      tenant_id INTEGER NOT NULL DEFAULT 1,
      name TEXT NOT NULL DEFAULT 'Your Shoe Store',
      logo TEXT DEFAULT '',
      address TEXT DEFAULT '',
      phone TEXT DEFAULT '',
      email TEXT DEFAULT '',
      website TEXT DEFAULT '',
      strn TEXT DEFAULT '',
      tax_id TEXT DEFAULT '',
      tax_number TEXT DEFAULT '',
      currency TEXT NOT NULL DEFAULT 'PKR',
      currency_name TEXT NOT NULL DEFAULT 'Pakistani Rupee',
      currency_symbol TEXT NOT NULL DEFAULT 'Rs.',
      invoice_prefix TEXT NOT NULL DEFAULT 'INV-',
      purchase_prefix TEXT NOT NULL DEFAULT 'PUR-',
      barcode_prefix TEXT NOT NULL DEFAULT '0108923',
      invoice_footer TEXT NOT NULL DEFAULT 'Thank you for shopping with us!',
      show_receipt_logo BOOLEAN NOT NULL DEFAULT false,
      receipt_logo TEXT DEFAULT '',
      low_stock_limit INTEGER NOT NULL DEFAULT 5,
      pricing_mode TEXT NOT NULL DEFAULT 'FIXED',
      pricing_policy_locked BOOLEAN NOT NULL DEFAULT false,
      is_installed BOOLEAN DEFAULT false,
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    );

    ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS tenant_id INTEGER NOT NULL DEFAULT 1;
    ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS strn TEXT DEFAULT '';
    ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS tax_id TEXT DEFAULT '';
    ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS tax_rate NUMERIC(5, 2) NOT NULL DEFAULT 0.00;
    ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS currency_name TEXT DEFAULT 'Pakistani Rupee';
    ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS is_installed BOOLEAN DEFAULT false;
    ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS pricing_mode TEXT DEFAULT 'FIXED';
    ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS pricing_policy_locked BOOLEAN DEFAULT false;
    ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS show_receipt_logo BOOLEAN DEFAULT false;
    ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS receipt_logo TEXT DEFAULT '';
    CREATE INDEX IF NOT EXISTS company_settings_tenant_idx ON company_settings(tenant_id);

    UPDATE company_settings SET pricing_policy_locked = false;

    CREATE TABLE IF NOT EXISTS products (
      id SERIAL PRIMARY KEY,
      tenant_id INTEGER NOT NULL DEFAULT 1,
      name TEXT NOT NULL,
      brand VARCHAR(100) NOT NULL DEFAULT 'Local',
      category VARCHAR(100) NOT NULL DEFAULT 'Casual Shoes',
      sku TEXT NOT NULL,
      barcode TEXT NOT NULL,
      article TEXT DEFAULT '',
      primary_image_url TEXT DEFAULT '',
      description TEXT DEFAULT '',
      cost_price NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
      selling_price INTEGER NOT NULL DEFAULT 0,
      min_price INTEGER NOT NULL DEFAULT 0,
      max_price INTEGER NOT NULL DEFAULT 0,
      pricing_policy TEXT DEFAULT NULL,
      total_stock INTEGER NOT NULL DEFAULT 0,
      low_stock_limit INTEGER NOT NULL DEFAULT 5,
      active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    );

    ALTER TABLE products ADD COLUMN IF NOT EXISTS tenant_id INTEGER NOT NULL DEFAULT 1;
    ALTER TABLE products ADD COLUMN IF NOT EXISTS brand VARCHAR(100) DEFAULT 'Local';
    ALTER TABLE products ADD COLUMN IF NOT EXISTS category VARCHAR(100) DEFAULT 'Casual Shoes';
    ALTER TABLE products ADD COLUMN IF NOT EXISTS article TEXT DEFAULT '';
    ALTER TABLE products ADD COLUMN IF NOT EXISTS primary_image_url TEXT DEFAULT '';
    ALTER TABLE products ADD COLUMN IF NOT EXISTS cost_price NUMERIC(12, 2) DEFAULT 0.00;
    ALTER TABLE products ADD COLUMN IF NOT EXISTS selling_price INTEGER DEFAULT 0;
    ALTER TABLE products ADD COLUMN IF NOT EXISTS min_price INTEGER DEFAULT 0;
    ALTER TABLE products ADD COLUMN IF NOT EXISTS max_price INTEGER DEFAULT 0;
    ALTER TABLE products ADD COLUMN IF NOT EXISTS pricing_policy TEXT DEFAULT NULL;
    ALTER TABLE products DROP CONSTRAINT IF EXISTS products_sku_key;
    ALTER TABLE products DROP CONSTRAINT IF EXISTS products_barcode_key;
    DROP INDEX IF EXISTS products_barcode_idx;
    DROP INDEX IF EXISTS products_sku_idx;

    CREATE INDEX IF NOT EXISTS products_tenant_idx ON products(tenant_id);
    CREATE INDEX IF NOT EXISTS products_brand_idx ON products(brand);
    CREATE INDEX IF NOT EXISTS products_category_idx ON products(category);
    CREATE INDEX IF NOT EXISTS products_barcode_idx ON products(barcode);
    CREATE INDEX IF NOT EXISTS products_sku_idx ON products(sku);
    CREATE INDEX IF NOT EXISTS products_article_idx ON products(article);
    CREATE INDEX IF NOT EXISTS products_active_idx ON products(active);

    CREATE TABLE IF NOT EXISTS customers (
      id SERIAL PRIMARY KEY,
      tenant_id INTEGER NOT NULL DEFAULT 1,
      name TEXT NOT NULL,
      phone TEXT NOT NULL,
      email TEXT,
      address TEXT,
      notes TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
    ALTER TABLE customers ADD COLUMN IF NOT EXISTS tenant_id INTEGER NOT NULL DEFAULT 1;
    CREATE INDEX IF NOT EXISTS customers_tenant_idx ON customers(tenant_id);
    CREATE INDEX IF NOT EXISTS customers_phone_idx ON customers(phone);

    CREATE TABLE IF NOT EXISTS suppliers (
      id SERIAL PRIMARY KEY,
      tenant_id INTEGER NOT NULL DEFAULT 1,
      name TEXT NOT NULL,
      phone TEXT DEFAULT '',
      email TEXT DEFAULT '',
      balance NUMERIC(12, 2) DEFAULT 0.00,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
    ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS tenant_id INTEGER NOT NULL DEFAULT 1;
    ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS balance NUMERIC(12, 2) DEFAULT 0.00;
    CREATE INDEX IF NOT EXISTS suppliers_tenant_idx ON suppliers(tenant_id);

    CREATE TABLE IF NOT EXISTS purchases (
      id SERIAL PRIMARY KEY,
      tenant_id INTEGER NOT NULL DEFAULT 1,
      purchase_number TEXT NOT NULL,
      supplier_id INTEGER REFERENCES suppliers(id) ON DELETE SET NULL,
      supplier_name TEXT NOT NULL,
      purchase_date TEXT NOT NULL,
      total_amount NUMERIC(12, 2) NOT NULL,
      paid_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
      payment_status TEXT NOT NULL DEFAULT 'UNPAID',
      payment_method TEXT DEFAULT 'CASH',
      notes TEXT,
      created_by INTEGER NOT NULL REFERENCES users(id),
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
    ALTER TABLE purchases ADD COLUMN IF NOT EXISTS tenant_id INTEGER NOT NULL DEFAULT 1;
    ALTER TABLE purchases ADD COLUMN IF NOT EXISTS supplier_id INTEGER REFERENCES suppliers(id) ON DELETE SET NULL;
    ALTER TABLE purchases ADD COLUMN IF NOT EXISTS paid_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00;
    ALTER TABLE purchases ADD COLUMN IF NOT EXISTS payment_status TEXT NOT NULL DEFAULT 'UNPAID';
    ALTER TABLE purchases ADD COLUMN IF NOT EXISTS payment_method TEXT DEFAULT 'CASH';
    ALTER TABLE purchases DROP CONSTRAINT IF EXISTS purchases_purchase_number_key;
    CREATE INDEX IF NOT EXISTS purchases_tenant_idx ON purchases(tenant_id);

    CREATE TABLE IF NOT EXISTS supplier_payments (
      id SERIAL PRIMARY KEY,
      tenant_id INTEGER NOT NULL DEFAULT 1,
      payment_number TEXT NOT NULL,
      supplier_id INTEGER NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
      supplier_name TEXT NOT NULL,
      purchase_id INTEGER REFERENCES purchases(id) ON DELETE SET NULL,
      amount NUMERIC(12, 2) NOT NULL,
      payment_date TEXT NOT NULL,
      payment_method TEXT NOT NULL DEFAULT 'CASH',
      reference_number TEXT DEFAULT '',
      notes TEXT DEFAULT '',
      created_by INTEGER NOT NULL REFERENCES users(id),
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
    ALTER TABLE supplier_payments ADD COLUMN IF NOT EXISTS tenant_id INTEGER NOT NULL DEFAULT 1;
    ALTER TABLE supplier_payments DROP CONSTRAINT IF EXISTS supplier_payments_payment_number_key;
    DROP INDEX IF EXISTS supplier_payments_number_idx;
    CREATE INDEX IF NOT EXISTS supplier_payments_tenant_idx ON supplier_payments(tenant_id);
    CREATE INDEX IF NOT EXISTS supplier_payments_supplier_idx ON supplier_payments(supplier_id);
    CREATE INDEX IF NOT EXISTS supplier_payments_date_idx ON supplier_payments(payment_date);
    CREATE INDEX IF NOT EXISTS supplier_payments_number_idx ON supplier_payments(payment_number);

    CREATE TABLE IF NOT EXISTS purchase_items (
      id SERIAL PRIMARY KEY,
      tenant_id INTEGER NOT NULL DEFAULT 1,
      purchase_id INTEGER NOT NULL REFERENCES purchases(id) ON DELETE CASCADE,
      product_id INTEGER NOT NULL REFERENCES products(id),
      quantity INTEGER NOT NULL,
      unit_purchase_price NUMERIC(12, 2) NOT NULL,
      subtotal NUMERIC(12, 2) NOT NULL
    );
    ALTER TABLE purchase_items ADD COLUMN IF NOT EXISTS tenant_id INTEGER NOT NULL DEFAULT 1;

    CREATE TABLE IF NOT EXISTS purchase_returns (
      id SERIAL PRIMARY KEY,
      tenant_id INTEGER NOT NULL DEFAULT 1,
      return_number TEXT NOT NULL,
      purchase_id INTEGER REFERENCES purchases(id) ON DELETE SET NULL,
      supplier_id INTEGER REFERENCES suppliers(id) ON DELETE SET NULL,
      supplier_name TEXT NOT NULL,
      return_date TEXT NOT NULL,
      total_debit_amount NUMERIC(12, 2) NOT NULL,
      reason TEXT NOT NULL,
      notes TEXT,
      created_by INTEGER NOT NULL REFERENCES users(id),
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
    ALTER TABLE purchase_returns ADD COLUMN IF NOT EXISTS tenant_id INTEGER NOT NULL DEFAULT 1;
    ALTER TABLE purchase_returns DROP CONSTRAINT IF EXISTS purchase_returns_return_number_key;
    DROP INDEX IF EXISTS purchase_returns_number_idx;
    CREATE INDEX IF NOT EXISTS purchase_returns_tenant_idx ON purchase_returns(tenant_id);
    CREATE INDEX IF NOT EXISTS purchase_returns_number_idx ON purchase_returns(return_number);
    CREATE INDEX IF NOT EXISTS purchase_returns_supplier_idx ON purchase_returns(supplier_id);

    CREATE TABLE IF NOT EXISTS purchase_return_items (
      id SERIAL PRIMARY KEY,
      tenant_id INTEGER NOT NULL DEFAULT 1,
      purchase_return_id INTEGER NOT NULL REFERENCES purchase_returns(id) ON DELETE CASCADE,
      product_id INTEGER NOT NULL REFERENCES products(id),
      quantity INTEGER NOT NULL,
      unit_purchase_price NUMERIC(12, 2) NOT NULL,
      subtotal NUMERIC(12, 2) NOT NULL,
      defect_type TEXT DEFAULT 'MANUFACTURING_DEFECT'
    );
    ALTER TABLE purchase_return_items ADD COLUMN IF NOT EXISTS tenant_id INTEGER NOT NULL DEFAULT 1;
    CREATE INDEX IF NOT EXISTS purchase_return_items_return_idx ON purchase_return_items(purchase_return_id);
    CREATE INDEX IF NOT EXISTS purchase_return_items_product_idx ON purchase_return_items(product_id);

    CREATE TABLE IF NOT EXISTS sales (
      id SERIAL PRIMARY KEY,
      tenant_id INTEGER NOT NULL DEFAULT 1,
      invoice_number TEXT NOT NULL,
      customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
      sale_date TEXT NOT NULL,
      subtotal NUMERIC(12, 2) NOT NULL,
      discount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
      total_amount NUMERIC(12, 2) NOT NULL,
      payment_method TEXT NOT NULL DEFAULT 'CASH',
      cash_received NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
      change_given NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
      created_by INTEGER NOT NULL REFERENCES users(id),
      is_min_price_overridden BOOLEAN NOT NULL DEFAULT false,
      overridden_by INTEGER REFERENCES users(id),
      notes TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
    ALTER TABLE sales ADD COLUMN IF NOT EXISTS tenant_id INTEGER NOT NULL DEFAULT 1;
    ALTER TABLE sales DROP CONSTRAINT IF EXISTS sales_invoice_number_key;
    DROP INDEX IF EXISTS sales_invoice_number_idx;
    CREATE INDEX IF NOT EXISTS sales_tenant_idx ON sales(tenant_id);
    CREATE INDEX IF NOT EXISTS sales_invoice_idx ON sales(invoice_number);

    CREATE TABLE IF NOT EXISTS sale_items (
      id SERIAL PRIMARY KEY,
      tenant_id INTEGER NOT NULL DEFAULT 1,
      sale_id INTEGER NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
      product_id INTEGER NOT NULL REFERENCES products(id),
      product_name TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      unit_price NUMERIC(12, 2) NOT NULL,
      discount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
      subtotal NUMERIC(12, 2) NOT NULL,
      purchase_price NUMERIC(12, 2) NOT NULL
    );
    ALTER TABLE sale_items ADD COLUMN IF NOT EXISTS tenant_id INTEGER NOT NULL DEFAULT 1;

    CREATE TABLE IF NOT EXISTS returns (
      id SERIAL PRIMARY KEY,
      tenant_id INTEGER NOT NULL DEFAULT 1,
      return_number TEXT NOT NULL,
      original_sale_id INTEGER NOT NULL REFERENCES sales(id),
      customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
      return_date TEXT NOT NULL,
      total_refund_amount NUMERIC(12, 2) NOT NULL,
      reason TEXT NOT NULL,
      created_by INTEGER NOT NULL REFERENCES users(id),
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
    ALTER TABLE returns ADD COLUMN IF NOT EXISTS tenant_id INTEGER NOT NULL DEFAULT 1;
    ALTER TABLE returns DROP CONSTRAINT IF EXISTS returns_return_number_key;
    CREATE INDEX IF NOT EXISTS returns_tenant_idx ON returns(tenant_id);

    CREATE TABLE IF NOT EXISTS return_items (
      id SERIAL PRIMARY KEY,
      tenant_id INTEGER NOT NULL DEFAULT 1,
      return_id INTEGER NOT NULL REFERENCES returns(id) ON DELETE CASCADE,
      sale_item_id INTEGER NOT NULL REFERENCES sale_items(id),
      product_id INTEGER NOT NULL REFERENCES products(id),
      quantity INTEGER NOT NULL,
      unit_refund_price NUMERIC(12, 2) NOT NULL,
      subtotal NUMERIC(12, 2) NOT NULL
    );
    ALTER TABLE return_items ADD COLUMN IF NOT EXISTS tenant_id INTEGER NOT NULL DEFAULT 1;

    CREATE TABLE IF NOT EXISTS stock_movements (
      id SERIAL PRIMARY KEY,
      tenant_id INTEGER NOT NULL DEFAULT 1,
      product_id INTEGER NOT NULL REFERENCES products(id),
      qty_change INTEGER NOT NULL,
      prev_stock INTEGER NOT NULL,
      new_stock INTEGER NOT NULL,
      movement_type TEXT NOT NULL,
      reference_id TEXT,
      user_id INTEGER NOT NULL REFERENCES users(id),
      notes TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
    ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS tenant_id INTEGER NOT NULL DEFAULT 1;
    CREATE INDEX IF NOT EXISTS stock_movements_tenant_idx ON stock_movements(tenant_id);
    CREATE INDEX IF NOT EXISTS stock_movements_product_idx ON stock_movements(product_id);
    CREATE INDEX IF NOT EXISTS stock_movements_created_at_idx ON stock_movements(created_at);
  `);
}

/**
 * Ensures that a given tenant store has both an active Store Owner (ADMIN) and Store Cashier (CASHIER)
 * account with verified credentials, returning their exact email and password for store auth quick login.
 */
export interface StoreQuickCredential {
  id: number;
  name: string;
  email: string;
  password: string;
  role: 'ADMIN' | 'CASHIER';
}

export async function ensureTenantStoreUsers(params: {
  tenantId: number;
  slug: string;
  storeName?: string;
  ownerName?: string;
  ownerEmail?: string;
  ownerPhone?: string;
  ownerPassword?: string;
}): Promise<{
  owner: StoreQuickCredential;
  cashier: StoreQuickCredential;
}> {
  const tenantId = Number(params.tenantId) || 1;
  const cleanSlug = (params.slug || 'tj-shoes').trim().toLowerCase();
  const storeLabel = (params.storeName || cleanSlug).trim();

  // Determine canonical store-specific emails & default passwords
  const defaultOwnerEmail =
    cleanSlug === 'tj-shoes'
      ? (params.ownerEmail || 'owner@shoepos.com').trim().toLowerCase()
      : cleanSlug === 'mystore'
      ? (params.ownerEmail || 'admin@mystore.com').trim().toLowerCase()
      : cleanSlug === 'apex-boots'
      ? (params.ownerEmail || 'admin@apexboots.pk').trim().toLowerCase()
      : (params.ownerEmail || `admin@${cleanSlug}.mypos.com`).trim().toLowerCase();

  const defaultOwnerName =
    (params.ownerName && params.ownerName.trim()) ||
    (cleanSlug === 'tj-shoes'
      ? 'Tariq Javed (Owner)'
      : cleanSlug === 'mystore'
      ? 'Hamza Siddiqui (Owner)'
      : cleanSlug === 'apex-boots'
      ? 'Usman Ghani (Owner)'
      : `${storeLabel} (Owner)`);

  const explicitPassword = params.ownerPassword && params.ownerPassword.trim() ? params.ownerPassword.trim() : '';

  const defaultOwnerPassword =
    explicitPassword ||
    (cleanSlug === 'tj-shoes' || cleanSlug === 'mystore' || cleanSlug === 'apex-boots'
      ? 'admin123'
      : `${cleanSlug}@2026`);

  const defaultCashierEmail =
    cleanSlug === 'tj-shoes'
      ? 'cashier@shoepos.com'
      : cleanSlug === 'mystore'
      ? 'cashier@mystore.com'
      : cleanSlug === 'apex-boots'
      ? 'cashier@apexboots.pk'
      : `cashier@${cleanSlug}.mypos.com`;

  const defaultCashierName =
    cleanSlug === 'tj-shoes'
      ? 'Bilal Counter Cashier'
      : cleanSlug === 'mystore'
      ? 'MyStore Counter Cashier'
      : cleanSlug === 'apex-boots'
      ? 'Apex Counter Cashier'
      : `${storeLabel} Cashier`;

  const defaultCashierPassword =
    cleanSlug === 'tj-shoes' || cleanSlug === 'mystore' || cleanSlug === 'apex-boots'
      ? 'cashier123'
      : `${cleanSlug}@cashier`;

  // 1. Resolve or create Store Owner (ADMIN)
  const adminRes = await pgClient.query<{
    id: number;
    name: string;
    email: string;
    password_hash: string;
    quick_password: string;
    status: string;
  }>(
    `SELECT id, name, email, password_hash, COALESCE(quick_password, '') as quick_password, status
     FROM users
     WHERE tenant_id = $1 AND role = 'ADMIN'
     ORDER BY id ASC
     LIMIT 1`,
    [tenantId]
  );

  let ownerCred: StoreQuickCredential;
  if (adminRes.rows.length > 0) {
    const row = adminRes.rows[0];
    let verifiedPass = '';
    if (row.quick_password && (await bcrypt.compare(row.quick_password, row.password_hash))) {
      verifiedPass = row.quick_password;
    } else {
      const candidates = Array.from(
        new Set([defaultOwnerPassword, 'admin123', `${cleanSlug}@2026`, 'password123', '123456'])
      );
      for (const cand of candidates) {
        if (await bcrypt.compare(cand, row.password_hash)) {
          verifiedPass = cand;
          break;
        }
      }
      if (!verifiedPass) {
        verifiedPass = defaultOwnerPassword;
        const freshHash = await bcrypt.hash(verifiedPass, 10);
        await pgClient.query(
          `UPDATE users SET password_hash = $1, quick_password = $2, status = 'APPROVED', active = true WHERE id = $3`,
          [freshHash, verifiedPass, row.id]
        );
      } else {
        await pgClient.query(
          `UPDATE users SET quick_password = $1, status = 'APPROVED', active = true WHERE id = $2`,
          [verifiedPass, row.id]
        );
      }
    }
    ownerCred = {
      id: row.id,
      name: row.name,
      email: row.email,
      password: verifiedPass,
      role: 'ADMIN',
    };
  } else {
    const ownerHash = await bcrypt.hash(defaultOwnerPassword, 10);
    const createdOwner = await pgClient.query<{ id: number; name: string; email: string }>(
      `INSERT INTO users (tenant_id, name, email, phone, password_hash, quick_password, role, status, active)
       VALUES ($1, $2, $3, $4, $5, $6, 'ADMIN', 'APPROVED', true)
       RETURNING id, name, email`,
      [tenantId, defaultOwnerName, defaultOwnerEmail, (params.ownerPhone || '').trim(), ownerHash, defaultOwnerPassword]
    );
    ownerCred = {
      id: createdOwner.rows[0].id,
      name: createdOwner.rows[0].name,
      email: createdOwner.rows[0].email,
      password: defaultOwnerPassword,
      role: 'ADMIN',
    };
  }

  // 2. Resolve or create Store Cashier (CASHIER)
  const cashierRes = await pgClient.query<{
    id: number;
    name: string;
    email: string;
    password_hash: string;
    quick_password: string;
    status: string;
  }>(
    `SELECT id, name, email, password_hash, COALESCE(quick_password, '') as quick_password, status
     FROM users
     WHERE tenant_id = $1 AND role = 'CASHIER'
     ORDER BY CASE WHEN status = 'APPROVED' THEN 0 ELSE 1 END, id ASC
     LIMIT 1`,
    [tenantId]
  );

  let cashierCred: StoreQuickCredential;
  if (cashierRes.rows.length > 0) {
    const row = cashierRes.rows[0];
    let verifiedPass = '';
    if (row.quick_password && (await bcrypt.compare(row.quick_password, row.password_hash))) {
      verifiedPass = row.quick_password;
    } else {
      const candidates = Array.from(
        new Set([defaultCashierPassword, 'cashier123', `${cleanSlug}@cashier`, `${cleanSlug}@2026`, '123456'])
      );
      for (const cand of candidates) {
        if (await bcrypt.compare(cand, row.password_hash)) {
          verifiedPass = cand;
          break;
        }
      }
      if (!verifiedPass) {
        verifiedPass = defaultCashierPassword;
        const freshHash = await bcrypt.hash(verifiedPass, 10);
        await pgClient.query(
          `UPDATE users SET password_hash = $1, quick_password = $2, status = 'APPROVED', active = true WHERE id = $3`,
          [freshHash, verifiedPass, row.id]
        );
      } else {
        await pgClient.query(
          `UPDATE users SET quick_password = $1, status = 'APPROVED', active = true WHERE id = $2`,
          [verifiedPass, row.id]
        );
      }
    }
    cashierCred = {
      id: row.id,
      name: row.name,
      email: row.email,
      password: verifiedPass,
      role: 'CASHIER',
    };
  } else {
    const cashierHash = await bcrypt.hash(defaultCashierPassword, 10);
    const createdCashier = await pgClient.query<{ id: number; name: string; email: string }>(
      `INSERT INTO users (tenant_id, name, email, phone, password_hash, quick_password, role, status, active)
       VALUES ($1, $2, $3, $4, $5, $6, 'CASHIER', 'APPROVED', true)
       RETURNING id, name, email`,
      [tenantId, defaultCashierName, defaultCashierEmail, (params.ownerPhone || '').trim(), cashierHash, defaultCashierPassword]
    );
    cashierCred = {
      id: createdCashier.rows[0].id,
      name: createdCashier.rows[0].name,
      email: createdCashier.rows[0].email,
      password: defaultCashierPassword,
      role: 'CASHIER',
    };
  }

  return {
    owner: ownerCred,
    cashier: cashierCred,
  };
}

/**
 * Seeds the SaaS Multi-Tenant Control Plane (Tenants, SuperAdmin account, and Pending Store Requests)
 * so that the SaaS Landing Page, SuperAdmin C-Panel, and Multi-Tenant POS work out of the box.
 */
export async function ensureSaasControlPlane(): Promise<void> {
  if (saasControlPlaneInitialized) return;
  await ensureDatabaseSchema();

  try {
    // 1. Seed Default Tenants if tenants table is empty
    const tenantCheck = await pgClient.query<{ count: string }>('SELECT COUNT(*) as count FROM tenants');
    const tenantCount = parseInt(tenantCheck.rows[0]?.count || '0', 10);

    if (tenantCount === 0) {
      const now = new Date();
      const oneYearLater = calculateSubscriptionEndDate('YEARLY', now);
      const sixMonthsLater = calculateSubscriptionEndDate('6_MONTHS', now);

      // Tenant 1: TJ Shoes Flagship (Active & Onboarded, YEARLY Plan)
      const t1 = await pgClient.query<{ id: number }>(
        `INSERT INTO tenants (
          name, slug, status, app_key, subscription_plan, subscription_start_date, subscription_end_date, subscription_status,
          theme_color, background_color, logo_url,
          owner_name, owner_email, owner_phone, business_address, tax_id,
          currency, currency_symbol, plan, is_onboarded, onboarding_completed
        ) VALUES ($1, $2, 'ACTIVE', 'APP-KEY-TJS1-9X4A', 'YEARLY', $8, $9, 'ACTIVE', '#2563EB', '#ffffff', '/icon.svg', $3, $4, $5, $6, $7, 'PKR', 'Rs.', 'YEARLY', true, true)
        RETURNING id`,
        [
          'TJ Shoes Flagship',
          'tj-shoes',
          'Tariq Javed',
          'owner@shoepos.com',
          '+92 300 8451122',
          'Shop #14, Mall Road Footwear Arcade, Lahore',
          'NTN-4829104-8',
          now,
          oneYearLater,
        ]
      );
      const t1Id = t1.rows[0]?.id || 1;

      // Ensure company_settings for Tenant 1
      const csCheck = await pgClient.query('SELECT id FROM company_settings WHERE tenant_id = $1 LIMIT 1', [t1Id]);
      if (csCheck.rows.length === 0) {
        await pgClient.query(
          `INSERT INTO company_settings (
            tenant_id, name, phone, email, address, tax_id, strn, logo,
            currency, currency_symbol, currency_name, invoice_prefix, purchase_prefix,
            barcode_prefix, pricing_mode, is_installed
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, '/icon.svg', 'PKR', 'Rs.', 'Pakistani Rupee', 'INV-', 'PUR-', '0108923', 'FIXED', true)`,
          [
            t1Id,
            'TJ Shoes Flagship',
            '+92 300 8451122',
            'owner@shoepos.com',
            'Shop #14, Mall Road Footwear Arcade, Lahore',
            'NTN-4829104-8',
            'STRN-32004910',
          ]
        );
      }

      // Ensure Store Admin & Cashier for Tenant 1
      const t1Users = await ensureTenantStoreUsers({
        tenantId: t1Id,
        slug: 'tj-shoes',
        storeName: 'TJ Shoes Flagship',
        ownerName: 'Tariq Javed (Owner)',
        ownerEmail: 'owner@shoepos.com',
        ownerPhone: '+92 300 8451122',
      });
      const ownerUserId = t1Users.owner.id;

      // Seed initial products & sales for Tenant 1 if none exist
      const prodCheck = await pgClient.query<{ count: string }>('SELECT COUNT(*) as count FROM products WHERE tenant_id = $1', [t1Id]);
      if (parseInt(prodCheck.rows[0]?.count || '0', 10) === 0) {
        const sampleProducts = [
          ['Clarks', 'Formal Dress Shoes', 'CLK-FD-0001', '0108923000015', 'Oxford Classic Leather', 4200, 6500, 34],
          ['Nike', 'Casual Shoes', 'NIK-CS-0002', '0108923000022', 'Air Runner Mesh Pro', 5500, 8900, 22],
          ['Bata', 'Sandals & Chappals', 'BAT-SC-0003', '0108923000039', 'Peshawari Chappal Heritage', 2100, 3500, 48],
          ['Skechers', 'Casual Shoes', 'SKC-CS-0004', '0108923000046', 'GoWalk Arch Fit Slip-On', 4800, 7600, 19],
          ['Service', 'Boys Footwear', 'SRV-BF-0005', '0108923000053', 'Junior Velcro Active Trainer', 1600, 2600, 28],
        ];
        for (const [brand, category, sku, barcode, article, cost, selling, stock] of sampleProducts) {
          await pgClient.query(
            `INSERT INTO products (
              tenant_id, name, brand, category, sku, barcode, article,
              cost_price, selling_price, min_price, max_price, total_stock, low_stock_limit, active
            ) VALUES ($1, $2, $3, $4, $5, $6, $2, $7, $8, $8, $8, $9, 5, true)`,
            [t1Id, article, brand, category, sku, barcode, cost, selling, stock]
          );
        }

        // Add sample customer & sales for Tenant 1
        const custRes = await pgClient.query<{ id: number }>(
          `INSERT INTO customers (tenant_id, name, phone, email, address)
           VALUES ($1, 'Kamran Akmal', '0300-4112233', 'kamran@gmail.com', 'DHA Phase 5, Lahore')
           RETURNING id`,
          [t1Id]
        );
        const pRows = await pgClient.query<{ id: number; article: string; selling_price: number; cost_price: string }>(
          'SELECT id, article, selling_price, cost_price FROM products WHERE tenant_id = $1 LIMIT 2',
          [t1Id]
        );
        if (ownerUserId && pRows.rows.length > 0) {
          const today = new Date().toISOString().split('T')[0];
          const sRes = await pgClient.query<{ id: number }>(
            `INSERT INTO sales (
              tenant_id, invoice_number, customer_id, sale_date, subtotal, discount, total_amount,
              payment_method, cash_received, change_given, created_by
            ) VALUES ($1, 'INV-000001', $2, $3, 13000, 0, 13000, 'CASH', 15000, 2000, $4)
            RETURNING id`,
            [t1Id, custRes.rows[0]?.id || null, today, ownerUserId]
          );
          if (sRes.rows[0]?.id) {
            await pgClient.query(
              `INSERT INTO sale_items (
                tenant_id, sale_id, product_id, product_name, quantity, unit_price, discount, subtotal, purchase_price
              ) VALUES ($1, $2, $3, $4, 2, 6500, 0, 13000, 4200)`,
              [t1Id, sRes.rows[0].id, pRows.rows[0].id, pRows.rows[0].article]
            );
          }
        }
      }

      // Tenant 2: mystore (Newly Provisioned, 6_MONTHS Plan)
      const t2 = await pgClient.query<{ id: number }>(
        `INSERT INTO tenants (
          name, slug, status, app_key, subscription_plan, subscription_start_date, subscription_end_date, subscription_status,
          theme_color, background_color, logo_url,
          owner_name, owner_email, owner_phone, business_address, tax_id,
          currency, currency_symbol, plan, is_onboarded, onboarding_completed
        ) VALUES ($1, $2, 'ACTIVE', 'APP-KEY-MYS2-7K3P', '6_MONTHS', $8, $9, 'ACTIVE', '#7C3AED', '#ffffff', '/icon.svg', $3, $4, $5, $6, $7, 'PKR', 'Rs.', '6_MONTHS', false, false)
        RETURNING id`,
        [
          'MyStore Footwear Studio',
          'mystore',
          'Hamza Siddiqui',
          'admin@mystore.com',
          '+92 333 9876543',
          'Plot 22-C, Zamzama Commercial Lane 4, Karachi',
          'NTN-7712930-4',
          now,
          sixMonthsLater,
        ]
      );
      const t2Id = t2.rows[0]?.id || 2;

      await pgClient.query(
        `INSERT INTO company_settings (
          tenant_id, name, phone, email, address, tax_id, logo,
          currency, currency_symbol, currency_name, invoice_prefix, purchase_prefix,
          barcode_prefix, pricing_mode, is_installed
        ) VALUES ($1, 'MyStore Footwear Studio', '+92 333 9876543', 'admin@mystore.com', 'Plot 22-C, Zamzama Commercial Lane 4, Karachi', 'NTN-7712930-4', '/icon.svg', 'PKR', 'Rs.', 'Pakistani Rupee', 'MYS-', 'PUR-', '0204519', 'FIXED', true)`,
        [t2Id]
      );

      await ensureTenantStoreUsers({
        tenantId: t2Id,
        slug: 'mystore',
        storeName: 'MyStore Footwear Studio',
        ownerName: 'Hamza Siddiqui (Owner)',
        ownerEmail: 'admin@mystore.com',
        ownerPhone: '+92 333 9876543',
      });

      await pgClient.query(
        `INSERT INTO products (
          tenant_id, name, brand, category, sku, barcode, article,
          cost_price, selling_price, min_price, max_price, total_stock, low_stock_limit, active
        ) VALUES
        ($1, 'Velvet Block Heel Sandal', 'Local', 'Heeled Sandals', 'MYS-HS-0001', '0204519000014', 'Velvet Block Heel Sandal', 2800, 4900, 4900, 4900, 16, 5, true),
        ($1, 'Suede Chelsea Loafer', 'Clarks', 'Formal Dress Shoes', 'MYS-FD-0002', '0204519000021', 'Suede Chelsea Loafer', 4100, 6800, 6800, 6800, 24, 5, true)`,
        [t2Id]
      );

      // Tenant 3: apex-boots (Suspended Tenant to demonstrate real-time middleware suspension)
      const t3 = await pgClient.query<{ id: number }>(
        `INSERT INTO tenants (
          name, slug, status, app_key, subscription_plan, subscription_start_date, subscription_end_date, subscription_status,
          theme_color, background_color, logo_url,
          owner_name, owner_email, owner_phone, business_address, tax_id,
          currency, currency_symbol, plan, is_onboarded, onboarding_completed
        ) VALUES ($1, $2, 'SUSPENDED', 'APP-KEY-APX3-5M8R', '6_MONTHS', $8, $9, 'SUSPENDED', '#DC2626', '#ffffff', '/icon.svg', $3, $4, $5, $6, $7, 'PKR', 'Rs.', '6_MONTHS', true, true)
        RETURNING id`,
        [
          'Apex Boots Emporium',
          'apex-boots',
          'Usman Ghani',
          'admin@apexboots.pk',
          '+92 312 5566778',
          'Saddar Bazaar, Rawalpindi',
          'NTN-1192834-1',
          now,
          sixMonthsLater,
        ]
      );
      const t3Id = t3.rows[0]?.id || 3;

      await pgClient.query(
        `INSERT INTO company_settings (
          tenant_id, name, phone, email, address, tax_id, logo,
          currency, currency_symbol, currency_name, invoice_prefix, purchase_prefix,
          barcode_prefix, pricing_mode, is_installed
        ) VALUES ($1, 'Apex Boots Emporium', '+92 312 5566778', 'admin@apexboots.pk', 'Saddar Bazaar, Rawalpindi', 'NTN-1192834-1', '/icon.svg', 'PKR', 'Rs.', 'Pakistani Rupee', 'APX-', 'PUR-', '0309812', 'FIXED', true)`,
        [t3Id]
      );

      await ensureTenantStoreUsers({
        tenantId: t3Id,
        slug: 'apex-boots',
        storeName: 'Apex Boots Emporium',
        ownerName: 'Usman Ghani (Owner)',
        ownerEmail: 'admin@apexboots.pk',
        ownerPhone: '+92 312 5566778',
      });
    }

    // Ensure every existing tenant in the database has a unique app_key, subscription_plan, subscription dates, and verified Store Owner/Cashier users
    const allTenants = await pgClient.query<{
      id: number;
      slug: string;
      name: string;
      status: string;
      app_key: string | null;
      subscription_plan: string | null;
      subscription_start_date: Date | string | null;
      subscription_end_date: Date | string | null;
      subscription_status: string | null;
      owner_name: string;
      owner_email: string;
      owner_phone: string;
    }>(
      'SELECT id, slug, name, status, app_key, subscription_plan, subscription_start_date, subscription_end_date, subscription_status, owner_name, owner_email, owner_phone FROM tenants ORDER BY id ASC'
    );

    for (const t of allTenants.rows) {
      let needsSubUpdate = false;
      let nextAppKey = t.app_key && t.app_key.trim() ? t.app_key.trim() : '';
      if (!nextAppKey) {
        nextAppKey = await generateUniqueAppKey();
        needsSubUpdate = true;
      }

      const nextPlan = normalizeSubscriptionPlan(
        t.subscription_plan || (t.slug === 'mystore' || t.slug === 'apex-boots' ? '6_MONTHS' : 'YEARLY')
      );
      if (t.subscription_plan !== nextPlan) {
        needsSubUpdate = true;
      }

      const startDt = t.subscription_start_date ? new Date(t.subscription_start_date) : new Date();
      const endDt = t.subscription_end_date
        ? new Date(t.subscription_end_date)
        : calculateSubscriptionEndDate(nextPlan, startDt);
      if (!t.subscription_start_date || !t.subscription_end_date) {
        needsSubUpdate = true;
      }

      const isExpiredNow = endDt.getTime() < Date.now();
      let nextSubStatus = (t.subscription_status || '').toUpperCase();
      if (String(t.status).toUpperCase() === 'SUSPENDED') {
        nextSubStatus = 'SUSPENDED';
      } else if (isExpiredNow) {
        nextSubStatus = 'EXPIRED';
      } else if (!['ACTIVE', 'EXPIRED', 'SUSPENDED'].includes(nextSubStatus)) {
        nextSubStatus = 'ACTIVE';
      }
      if (t.subscription_status !== nextSubStatus) {
        needsSubUpdate = true;
      }

      if (needsSubUpdate) {
        await pgClient.query(
          `UPDATE tenants
           SET app_key = $1,
               subscription_plan = $2,
               subscription_start_date = $3,
               subscription_end_date = $4,
               subscription_status = $5,
               updated_at = NOW()
           WHERE id = $6`,
          [nextAppKey, nextPlan, startDt.toISOString(), endDt.toISOString(), nextSubStatus, t.id]
        );
      }

      await ensureTenantStoreUsers({
        tenantId: t.id,
        slug: t.slug,
        storeName: t.name,
        ownerName: t.owner_name,
        ownerEmail: t.owner_email,
        ownerPhone: t.owner_phone,
      });
    }

    await syncExpiredTenantSubscriptions();

    // 2. Ensure Global SuperAdmin User exists (superadmin@mypos.com / superadmin123)
    const saCheck = await pgClient.query("SELECT id FROM users WHERE LOWER(email) = 'superadmin@mypos.com' LIMIT 1");
    const saHash = await bcrypt.hash('superadmin123', 10);
    if (saCheck.rows.length === 0) {
      await pgClient.query(
        `INSERT INTO users (tenant_id, name, email, phone, password_hash, role, status)
         VALUES (1, 'Platform SuperAdmin', 'superadmin@mypos.com', '+92 300 0000001', $1, 'SUPERADMIN', 'APPROVED')`,
        [saHash]
      );
    } else {
      await pgClient.query(
        `UPDATE users SET role = 'SUPERADMIN', status = 'APPROVED', tenant_id = 1 WHERE id = $1`,
        [saCheck.rows[0].id]
      );
    }

    // 3. Ensure deleted_store_requests tracking table exists and never re-seed store_requests once initialized
    await pgClient.exec(`
      CREATE TABLE IF NOT EXISTS deleted_store_requests (
        id SERIAL PRIMARY KEY,
        request_id INTEGER,
        requested_slug TEXT NOT NULL,
        deleted_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS deleted_store_requests_slug_idx ON deleted_store_requests(requested_slug);
    `);

    // One-time cleanup of auto-reseeded demo store requests ('stepup', 'sole-craft') that reappeared after deletion
    const cleanupMarkerCheck = await pgClient.query<{ count: string }>(
      "SELECT COUNT(*) as count FROM deleted_store_requests WHERE requested_slug = '__reseed_cleanup_done__'"
    );
    if (parseInt(cleanupMarkerCheck.rows[0]?.count || '0', 10) === 0) {
      await pgClient.query(
        `DELETE FROM store_requests
         WHERE LOWER(requested_slug) IN ('stepup', 'sole-craft')
           AND status = 'PENDING'
           AND owner_email IN ('ayesha@stepupfootwear.pk', 'faisal@solecraft.pk')`
      );
      await pgClient.query(
        `INSERT INTO deleted_store_requests (request_id, requested_slug) VALUES (0, '__reseed_cleanup_done__')`
      );
    }

    // Purge any store_requests that match previously deleted slugs
    await pgClient.query(
      `DELETE FROM store_requests
       WHERE LOWER(requested_slug) IN (
         SELECT LOWER(requested_slug) FROM deleted_store_requests WHERE requested_slug != '__reseed_cleanup_done__'
       )`
    );

    saasControlPlaneInitialized = true;
  } catch (err: any) {
    console.warn('Notice during SaaS control plane initialization:', err?.message || err);
  }
}

/**
 * Drops all tables and relations in the public database schema with CASCADE.
 */
export async function dropAllTables(): Promise<void> {
  await pgClient.waitReady;
  saasControlPlaneInitialized = false;

  await pgClient.exec(`
    DROP TABLE IF EXISTS 
      store_requests,
      tenants,
      password_reset_tokens,
      stock_movements,
      return_items,
      returns,
      sale_items,
      sales,
      purchase_return_items,
      purchase_returns,
      supplier_payments,
      purchase_items,
      purchases,
      products,
      customers,
      suppliers,
      categories,
      brands,
      api_tokens,
      company_settings,
      users
    CASCADE;
  `);

  try {
    const remainingTables = await pgClient.query<{ tablename: string }>(`
      SELECT tablename 
      FROM pg_tables 
      WHERE schemaname = 'public'
    `);

    for (const row of remainingTables.rows) {
      await pgClient.exec(`DROP TABLE IF EXISTS "${row.tablename}" CASCADE;`);
    }
  } catch (err: any) {
    console.warn('Notice during dynamic table drop:', err.message);
  }

  console.log('🗑️ All database tables successfully dropped with CASCADE.');
}
