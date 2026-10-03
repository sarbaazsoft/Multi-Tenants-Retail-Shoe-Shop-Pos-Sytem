import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { pgClient } from './index.ts';

let saasControlPlaneInitialized = false;
let saasControlPlanePromise: Promise<void> | null = null;
let databaseSchemaPromise: Promise<void> | null = null;

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
  if (saasControlPlaneInitialized) return;
  if (databaseSchemaPromise) return databaseSchemaPromise;

  databaseSchemaPromise = (async () => {
    try {
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
      onboarding_completed BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    );

    ALTER TABLE tenants ADD COLUMN IF NOT EXISTS app_key TEXT;
    ALTER TABLE tenants ADD COLUMN IF NOT EXISTS subscription_plan TEXT NOT NULL DEFAULT 'YEARLY';
    ALTER TABLE tenants ADD COLUMN IF NOT EXISTS subscription_start_date TIMESTAMP NOT NULL DEFAULT NOW();
    ALTER TABLE tenants ADD COLUMN IF NOT EXISTS subscription_end_date TIMESTAMP NOT NULL DEFAULT (NOW() + INTERVAL '1 year');
    ALTER TABLE tenants ADD COLUMN IF NOT EXISTS subscription_status TEXT NOT NULL DEFAULT 'ACTIVE';
    ALTER TABLE tenants ADD COLUMN IF NOT EXISTS theme_color TEXT NOT NULL DEFAULT '#2563EB';
    ALTER TABLE tenants ADD COLUMN IF NOT EXISTS background_color TEXT NOT NULL DEFAULT '#ffffff';
    ALTER TABLE tenants ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN NOT NULL DEFAULT false;
    CREATE INDEX IF NOT EXISTS tenants_slug_idx ON tenants(slug);
    CREATE INDEX IF NOT EXISTS tenants_status_idx ON tenants(status);
    CREATE UNIQUE INDEX IF NOT EXISTS tenants_app_key_idx ON tenants(app_key);
    CREATE INDEX IF NOT EXISTS tenants_subscription_status_idx ON tenants(subscription_status);

    CREATE TABLE IF NOT EXISTS store_requests (
      id SERIAL PRIMARY KEY,
      store_name TEXT NOT NULL,
      requested_slug TEXT NOT NULL,
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
    ALTER TABLE store_requests DROP COLUMN IF EXISTS owner_name;

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
      logo TEXT DEFAULT '',
      address TEXT DEFAULT '',
      phone TEXT DEFAULT '',
      email TEXT DEFAULT '',
      website TEXT DEFAULT '',
      strn TEXT DEFAULT '',
      tax_id TEXT DEFAULT '',
      tax_rate NUMERIC(5, 2) NOT NULL DEFAULT 0.00,
      currency TEXT NOT NULL DEFAULT 'PKR',
      currency_name TEXT NOT NULL DEFAULT 'Pakistani Rupee',
      currency_symbol TEXT NOT NULL DEFAULT 'Rs.',
      invoice_prefix TEXT NOT NULL DEFAULT 'INV-',
      purchase_prefix TEXT NOT NULL DEFAULT 'PUR-',
      barcode_prefix TEXT NOT NULL DEFAULT '',
      invoice_footer TEXT NOT NULL DEFAULT 'Thank you for shopping with us!',
      show_receipt_logo BOOLEAN NOT NULL DEFAULT false,
      receipt_logo TEXT DEFAULT '',
      low_stock_limit INTEGER NOT NULL DEFAULT 5,
      pricing_mode TEXT NOT NULL DEFAULT 'FIXED',
      pricing_policy_locked BOOLEAN NOT NULL DEFAULT false,
      deleted_product_ids INTEGER[] NOT NULL DEFAULT '{}',
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
    ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS deleted_product_ids INTEGER[] NOT NULL DEFAULT '{}';
    CREATE INDEX IF NOT EXISTS company_settings_tenant_idx ON company_settings(tenant_id);

    -- Consolidate & drop legacy duplicate columns between tenants, company_settings, and users
    DO $$
    BEGIN
      -- 1. If company_settings had legacy name column, migrate non-default values into tenants.name and drop company_settings.name
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'company_settings' AND column_name = 'name'
      ) THEN
        EXECUTE 'UPDATE tenants t SET name = cs.name FROM company_settings cs WHERE cs.tenant_id = t.id AND cs.name IS NOT NULL AND TRIM(cs.name) != '''' AND cs.name != ''Your Shoe Store''';
        EXECUTE 'ALTER TABLE company_settings DROP COLUMN IF EXISTS name';
      END IF;

      -- 2. If company_settings had legacy tax_number column, migrate non-empty values into tax_id and drop tax_number
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'company_settings' AND column_name = 'tax_number'
      ) THEN
        EXECUTE 'UPDATE company_settings SET tax_id = tax_number WHERE (tax_id IS NULL OR tax_id = '''') AND tax_number IS NOT NULL AND tax_number != ''''';
        EXECUTE 'ALTER TABLE company_settings DROP COLUMN IF EXISTS tax_number';
      END IF;

      -- 2. If tenants had legacy is_onboarded column, sync into onboarding_completed before dropping
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'tenants' AND column_name = 'is_onboarded'
      ) THEN
        EXECUTE 'UPDATE tenants SET onboarding_completed = true WHERE is_onboarded = true';
      END IF;

      -- 3. Migrate any existing store profile fields from tenants into company_settings before dropping duplicate columns
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'tenants' AND column_name = 'logo_url'
      ) THEN
        EXECUTE 'UPDATE company_settings cs SET logo = t.logo_url FROM tenants t WHERE cs.tenant_id = t.id AND (cs.logo IS NULL OR cs.logo = '''') AND t.logo_url IS NOT NULL AND t.logo_url != ''''';
      END IF;

      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'tenants' AND column_name = 'address'
      ) THEN
        EXECUTE 'UPDATE company_settings cs SET address = t.address FROM tenants t WHERE cs.tenant_id = t.id AND (cs.address IS NULL OR cs.address = '''') AND t.address IS NOT NULL AND t.address != ''''';
      END IF;

      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'tenants' AND column_name = 'business_address'
      ) THEN
        EXECUTE 'UPDATE company_settings cs SET address = t.business_address FROM tenants t WHERE cs.tenant_id = t.id AND (cs.address IS NULL OR cs.address = '''') AND t.business_address IS NOT NULL AND t.business_address != ''''';
      END IF;

      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'tenants' AND column_name = 'tax_id'
      ) THEN
        EXECUTE 'UPDATE company_settings cs SET tax_id = t.tax_id FROM tenants t WHERE cs.tenant_id = t.id AND (cs.tax_id IS NULL OR cs.tax_id = '''') AND t.tax_id IS NOT NULL AND t.tax_id != ''''';
      END IF;

      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'tenants' AND column_name = 'currency'
      ) THEN
        EXECUTE 'UPDATE company_settings cs SET currency = t.currency FROM tenants t WHERE cs.tenant_id = t.id AND (cs.currency IS NULL OR cs.currency = '''') AND t.currency IS NOT NULL AND t.currency != ''''';
      END IF;

      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'tenants' AND column_name = 'currency_symbol'
      ) THEN
        EXECUTE 'UPDATE company_settings cs SET currency_symbol = t.currency_symbol FROM tenants t WHERE cs.tenant_id = t.id AND (cs.currency_symbol IS NULL OR cs.currency_symbol = '''') AND t.currency_symbol IS NOT NULL AND t.currency_symbol != ''''';
      END IF;

      -- 4. Drop duplicate owner & store profile columns from tenants (single source of truth: users for owner identity, company_settings for store profile)
      ALTER TABLE tenants DROP COLUMN IF EXISTS owner_name;
      ALTER TABLE tenants DROP COLUMN IF EXISTS owner_email;
      ALTER TABLE tenants DROP COLUMN IF EXISTS owner_phone;
      ALTER TABLE tenants DROP COLUMN IF EXISTS business_address;
      ALTER TABLE tenants DROP COLUMN IF EXISTS address;
      ALTER TABLE tenants DROP COLUMN IF EXISTS tax_id;
      ALTER TABLE tenants DROP COLUMN IF EXISTS currency;
      ALTER TABLE tenants DROP COLUMN IF EXISTS currency_symbol;
      ALTER TABLE tenants DROP COLUMN IF EXISTS logo_url;
      ALTER TABLE tenants DROP COLUMN IF EXISTS plan;
      ALTER TABLE tenants DROP COLUMN IF EXISTS is_onboarded;
    END $$;

    UPDATE company_settings cs
    SET pricing_policy_locked = true,
        is_installed = true
    FROM tenants t
    WHERE cs.tenant_id = t.id
      AND t.onboarding_completed = true;

    CREATE TABLE IF NOT EXISTS brands (
      id SERIAL PRIMARY KEY,
      tenant_id INTEGER NOT NULL DEFAULT 1,
      name TEXT NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
    ALTER TABLE brands ADD COLUMN IF NOT EXISTS tenant_id INTEGER NOT NULL DEFAULT 1;
    CREATE INDEX IF NOT EXISTS brands_tenant_idx ON brands(tenant_id);

    DELETE FROM brands a USING brands b
    WHERE a.id > b.id
      AND a.tenant_id = b.tenant_id
      AND LOWER(TRIM(a.name)) = LOWER(TRIM(b.name));

    CREATE UNIQUE INDEX IF NOT EXISTS brands_tenant_name_lower_idx ON brands(tenant_id, LOWER(TRIM(name)));

    CREATE TABLE IF NOT EXISTS categories (
      id SERIAL PRIMARY KEY,
      tenant_id INTEGER NOT NULL DEFAULT 1,
      name TEXT NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
    ALTER TABLE categories ADD COLUMN IF NOT EXISTS tenant_id INTEGER NOT NULL DEFAULT 1;
    CREATE INDEX IF NOT EXISTS categories_tenant_idx ON categories(tenant_id);

    DELETE FROM categories a USING categories b
    WHERE a.id > b.id
      AND a.tenant_id = b.tenant_id
      AND LOWER(TRIM(a.name)) = LOWER(TRIM(b.name));

    CREATE UNIQUE INDEX IF NOT EXISTS categories_tenant_name_lower_idx ON categories(tenant_id, LOWER(TRIM(name)));

    CREATE TABLE IF NOT EXISTS products (
      id SERIAL PRIMARY KEY,
      tenant_id INTEGER NOT NULL DEFAULT 1,
      tenant_product_no INTEGER,
      name TEXT NOT NULL,
      brand VARCHAR(100) NOT NULL DEFAULT 'Local',
      category VARCHAR(100) NOT NULL DEFAULT 'Men',
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
    ALTER TABLE products ADD COLUMN IF NOT EXISTS tenant_product_no INTEGER;
    ALTER TABLE products ADD COLUMN IF NOT EXISTS brand VARCHAR(100) DEFAULT 'Local';
    ALTER TABLE products ADD COLUMN IF NOT EXISTS category VARCHAR(100) DEFAULT 'Men';
    ALTER TABLE products ADD COLUMN IF NOT EXISTS article TEXT DEFAULT '';
    ALTER TABLE products ADD COLUMN IF NOT EXISTS primary_image_url TEXT DEFAULT '';
    ALTER TABLE products ADD COLUMN IF NOT EXISTS cost_price NUMERIC(12, 2) DEFAULT 0.00;
    ALTER TABLE products ADD COLUMN IF NOT EXISTS selling_price INTEGER DEFAULT 0;
    ALTER TABLE products ADD COLUMN IF NOT EXISTS min_price INTEGER DEFAULT 0;
    ALTER TABLE products ADD COLUMN IF NOT EXISTS max_price INTEGER DEFAULT 0;
    ALTER TABLE products ADD COLUMN IF NOT EXISTS pricing_policy TEXT DEFAULT NULL;
    ALTER TABLE products DROP CONSTRAINT IF EXISTS products_sku_key;
    ALTER TABLE products DROP CONSTRAINT IF EXISTS products_barcode_key;
    ALTER TABLE products DROP CONSTRAINT IF EXISTS products_article_key;
    ALTER TABLE products DROP CONSTRAINT IF EXISTS products_sku_unique;
    ALTER TABLE products DROP CONSTRAINT IF EXISTS products_barcode_unique;
    ALTER TABLE products DROP CONSTRAINT IF EXISTS products_article_unique;
    DROP INDEX IF EXISTS products_barcode_idx;
    DROP INDEX IF EXISTS products_sku_idx;
    DROP INDEX IF EXISTS products_article_idx;

    -- Dynamically drop any remaining non-tenant UNIQUE constraint or UNIQUE index on products (sku, barcode, article must be unique per store tenant_id, NEVER globally)
    DO $$
    DECLARE
      c RECORD;
      idx RECORD;
    BEGIN
      FOR c IN
        SELECT con.conname
        FROM pg_constraint con
        JOIN pg_class rel ON rel.oid = con.conrelid
        JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
        WHERE nsp.nspname = 'public'
          AND rel.relname = 'products'
          AND con.contype = 'u'
          AND NOT EXISTS (
            SELECT 1
            FROM unnest(con.conkey) AS k(col_attnum)
            JOIN pg_attribute attr ON attr.attrelid = rel.oid AND attr.attnum = k.col_attnum
            WHERE attr.attname = 'tenant_id'
          )
      LOOP
        EXECUTE format('ALTER TABLE public.products DROP CONSTRAINT IF EXISTS %I CASCADE', c.conname);
      END LOOP;

      FOR idx IN
        SELECT i.relname AS index_name
        FROM pg_index ix
        JOIN pg_class t ON t.oid = ix.indrelid
        JOIN pg_class i ON i.oid = ix.indexrelid
        JOIN pg_namespace nsp ON nsp.oid = t.relnamespace
        WHERE nsp.nspname = 'public'
          AND t.relname = 'products'
          AND ix.indisunique = true
          AND ix.indisprimary = false
          AND NOT EXISTS (
            SELECT 1
            FROM unnest(ix.indkey) AS k(col_attnum)
            JOIN pg_attribute attr ON attr.attrelid = t.oid AND attr.attnum = k.col_attnum
            WHERE attr.attname = 'tenant_id'
          )
      LOOP
        EXECUTE format('DROP INDEX IF EXISTS public.%I CASCADE', idx.index_name);
      END LOOP;
    END $$;

    -- Backfill tenant_product_no per tenant (1..N) for any existing rows where it is NULL
    WITH numbered AS (
      SELECT id,
             ROW_NUMBER() OVER (PARTITION BY COALESCE(tenant_id, 1) ORDER BY id ASC) AS rn
      FROM products
      WHERE tenant_product_no IS NULL
    )
    UPDATE products p
    SET tenant_product_no = numbered.rn
    FROM numbered
    WHERE p.id = numbered.id;

    CREATE INDEX IF NOT EXISTS products_tenant_idx ON products(tenant_id);
    CREATE INDEX IF NOT EXISTS products_tenant_product_no_idx ON products(tenant_id, tenant_product_no);
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
    } finally {
      databaseSchemaPromise = null;
    }
  })();

  return databaseSchemaPromise;
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
  ownerEmail?: string;
  ownerName?: string;
  ownerPhone?: string;
  ownerPassword?: string;
  createCashier?: boolean;
  cashierName?: string;
  cashierEmail?: string;
  cashierPhone?: string;
  cashierPassword?: string;
}): Promise<{
  owner: StoreQuickCredential;
  cashier: StoreQuickCredential | null;
}> {
  const tenantId = Number(params.tenantId) || 1;
  const cleanSlug = (params.slug || 'store').trim().toLowerCase();
  const storeLabel = (params.storeName || cleanSlug).trim();

  // Determine canonical store-specific emails & default passwords
  const defaultOwnerEmail = (params.ownerEmail || `admin@${cleanSlug}.com`).trim().toLowerCase();
  const defaultOwnerName = (params.ownerName || `${storeLabel} Owner`).trim();
  const explicitPassword = params.ownerPassword && params.ownerPassword.trim() ? params.ownerPassword.trim() : '';
  const defaultOwnerPassword = explicitPassword || `${cleanSlug}@2026`;

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

  // 2. Resolve Store Cashier (CASHIER) - ONLY create if explicitly requested by user (never automatically!)
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

  let cashierCred: StoreQuickCredential | null = null;
  if (cashierRes.rows.length > 0) {
    const row = cashierRes.rows[0];
    let verifiedPass = row.quick_password || '';
    if (!verifiedPass) {
      const candidates = Array.from(
        new Set(['cashier123', `${cleanSlug}@cashier`, `${cleanSlug}@2026`, '123456'])
      );
      for (const cand of candidates) {
        if (await bcrypt.compare(cand, row.password_hash)) {
          verifiedPass = cand;
          break;
        }
      }
    }
    cashierCred = {
      id: row.id,
      name: row.name,
      email: row.email,
      password: verifiedPass,
      role: 'CASHIER',
    };
  } else if (params.createCashier && params.cashierEmail && params.cashierPassword) {
    // Only create cashier when user explicitly requests it in onboarding or settings
    const cPass = params.cashierPassword.trim();
    const cEmail = params.cashierEmail.trim().toLowerCase();
    const cName = (params.cashierName || `${storeLabel} Cashier`).trim();
    const cPhone = (params.cashierPhone || '').trim();
    const cashierHash = await bcrypt.hash(cPass, 10);

    const createdCashier = await pgClient.query<{ id: number; name: string; email: string }>(
      `INSERT INTO users (tenant_id, name, email, phone, password_hash, quick_password, role, status, active)
       VALUES ($1, $2, $3, $4, $5, $6, 'CASHIER', 'APPROVED', true)
       RETURNING id, name, email`,
      [tenantId, cName, cEmail, cPhone, cashierHash, cPass]
    );
    cashierCred = {
      id: createdCashier.rows[0].id,
      name: createdCashier.rows[0].name,
      email: createdCashier.rows[0].email,
      password: cPass,
      role: 'CASHIER',
    };
  }

  return {
    owner: ownerCred,
    cashier: cashierCred,
  };
}

/**
 * Strictly ensures there is ONLY ONE superadmin account in the initial database seed / system:
 * Email: talhah.jan@gmail.com
 * Password: Khalid@123
 * Role: SUPERADMIN
 * Status: APPROVED
 */
export async function ensureSuperAdminAccount(): Promise<number> {
  const targetSuperAdminEmail = 'talhah.jan@gmail.com';
  const targetSuperAdminPass = 'Khalid@123';
  const saHash = await bcrypt.hash(targetSuperAdminPass, 10);

  const exactSa = await pgClient.query<{ id: number; email: string; password_hash: string; quick_password: string }>(
    "SELECT id, email, password_hash, quick_password FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1",
    [targetSuperAdminEmail]
  );

  let saUserId: number;
  if (exactSa.rows.length > 0) {
    saUserId = exactSa.rows[0].id;
    const isPassValid = await bcrypt.compare(targetSuperAdminPass, exactSa.rows[0].password_hash).catch(() => false);
    if (!isPassValid || exactSa.rows[0].quick_password !== targetSuperAdminPass) {
      await pgClient.query(
        `UPDATE users
         SET email = $1,
             password_hash = $2,
             quick_password = $3,
             name = 'Platform SuperAdmin',
             role = 'SUPERADMIN',
             status = 'APPROVED',
             active = true,
             tenant_id = 1
         WHERE id = $4`,
        [targetSuperAdminEmail, saHash, targetSuperAdminPass, saUserId]
      );
    }
  } else {
    const oldSa = await pgClient.query<{ id: number }>(
      "SELECT id FROM users WHERE role = 'SUPERADMIN' ORDER BY id ASC LIMIT 1"
    );
    if (oldSa.rows.length > 0) {
      saUserId = oldSa.rows[0].id;
      await pgClient.query(
        `UPDATE users
         SET email = $1,
             password_hash = $2,
             quick_password = $3,
             name = 'Platform SuperAdmin',
             role = 'SUPERADMIN',
             status = 'APPROVED',
             active = true,
             tenant_id = 1
         WHERE id = $4`,
        [targetSuperAdminEmail, saHash, targetSuperAdminPass, saUserId]
      );
    } else {
      const newSa = await pgClient.query<{ id: number }>(
        `INSERT INTO users (tenant_id, name, email, phone, password_hash, quick_password, role, status, active)
         VALUES (1, 'Platform SuperAdmin', $1, '+92 300 0000001', $2, $3, 'SUPERADMIN', 'APPROVED', true)
         RETURNING id`,
        [targetSuperAdminEmail, saHash, targetSuperAdminPass]
      );
      saUserId = newSa.rows[0].id;
    }
  }

  // Delete ANY other users that have role = 'SUPERADMIN' so there is strictly ONLY ONE superadmin account!
  await pgClient.query(
    `DELETE FROM users WHERE role = 'SUPERADMIN' AND id != $1`,
    [saUserId]
  );

  return saUserId;
}

/**
 * Initializes the SaaS Multi-Tenant Control Plane (Global SuperAdmin account and subscription sync)
 * without seeding any demo stores or demo store requests.
 */
export async function ensureSaasControlPlane(): Promise<void> {
  if (saasControlPlaneInitialized) return;
  if (saasControlPlanePromise) return saasControlPlanePromise;

  saasControlPlanePromise = (async () => {
    try {
      await pgClient.waitReady;

      // Always ensure the single canonical SuperAdmin account exists with exact credentials
      await ensureSuperAdminAccount();

      // Fast-path check: if schema & control plane have already been verified in this persistent DB, skip heavy DDL & bcrypt loops
      const fastCheck = await pgClient
        .query<{ count: string }>(
          `SELECT COUNT(*) as count FROM deleted_store_requests WHERE requested_slug = '__schema_v6_talhah_ready__'`
        )
        .catch(() => null);

      if (fastCheck && parseInt(fastCheck.rows[0]?.count || '0', 10) > 0) {
        await syncExpiredTenantSubscriptions();
        saasControlPlaneInitialized = true;
        return;
      }

      await ensureDatabaseSchema();

      // 1. Ensure deleted_store_requests tracking table exists
    await pgClient.exec(`
      CREATE TABLE IF NOT EXISTS deleted_store_requests (
        id SERIAL PRIMARY KEY,
        request_id INTEGER,
        requested_slug TEXT NOT NULL,
        deleted_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS deleted_store_requests_slug_idx ON deleted_store_requests(requested_slug);
    `);

    // One-time cleanup of any previously auto-seeded demo stores ('tj-shoes', 'mystore', 'apex-boots') and demo store requests ('stepup', 'sole-craft')
    const seedPurgeCheck = await pgClient.query<{ count: string }>(
      "SELECT COUNT(*) as count FROM deleted_store_requests WHERE requested_slug = '__seeded_stores_and_requests_removed_v1__'"
    );
    if (parseInt(seedPurgeCheck.rows[0]?.count || '0', 10) === 0) {
      // Remove auto-seeded demo store requests
      await pgClient
        .query(
          `DELETE FROM store_requests
           WHERE LOWER(requested_slug) IN ('stepup', 'sole-craft')
              OR owner_email IN ('ayesha@stepupfootwear.pk', 'faisal@solecraft.pk')`
        )
        .catch(() => {});

      // Find any auto-seeded demo stores by their seeded app_key / slug
      const demoStoresRes = await pgClient
        .query<{ id: number; slug: string }>(
          `SELECT t.id, t.slug FROM tenants t
           WHERE t.app_key IN ('APP-KEY-TJS1-9X4A', 'APP-KEY-MYS2-7K3P', 'APP-KEY-APX3-5M8R')`
        )
        .catch(() => ({ rows: [] as Array<{ id: number; slug: string }> }));

      for (const ds of demoStoresRes.rows) {
        const tid = ds.id;
        const cleanupTables = [
          `DELETE FROM return_items WHERE tenant_id = $1`,
          `DELETE FROM returns WHERE tenant_id = $1`,
          `DELETE FROM sale_items WHERE tenant_id = $1`,
          `DELETE FROM sales WHERE tenant_id = $1`,
          `DELETE FROM purchase_return_items WHERE tenant_id = $1`,
          `DELETE FROM purchase_returns WHERE tenant_id = $1`,
          `DELETE FROM supplier_payments WHERE tenant_id = $1`,
          `DELETE FROM purchase_items WHERE tenant_id = $1`,
          `DELETE FROM purchases WHERE tenant_id = $1`,
          `DELETE FROM stock_movements WHERE tenant_id = $1`,
          `DELETE FROM products WHERE tenant_id = $1`,
          `DELETE FROM customers WHERE tenant_id = $1`,
          `DELETE FROM suppliers WHERE tenant_id = $1`,
          `DELETE FROM company_settings WHERE tenant_id = $1`,
          `DELETE FROM users WHERE tenant_id = $1 AND role != 'SUPERADMIN'`,
          `DELETE FROM tenants WHERE id = $1`,
        ];
        for (const q of cleanupTables) {
          await pgClient.query(q, [tid]).catch(() => {});
        }
      }

      await pgClient
        .query(
          `INSERT INTO deleted_store_requests (request_id, requested_slug) VALUES (0, '__seeded_stores_and_requests_removed_v1__')`
        )
        .catch(() => {});
    }

    // 2. Ensure every existing user-created tenant in the database has a unique app_key, subscription_plan, subscription dates, and verified Store Owner/Cashier users
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
      owner_email: string | null;
      owner_phone: string | null;
    }>(
      `SELECT t.id, t.slug, t.name, t.status, t.app_key, t.subscription_plan,
              t.subscription_start_date, t.subscription_end_date, t.subscription_status,
              u.email AS owner_email, u.phone AS owner_phone
       FROM tenants t
       LEFT JOIN LATERAL (
         SELECT email, phone
         FROM users
         WHERE tenant_id = t.id AND role = 'ADMIN'
         ORDER BY id ASC
         LIMIT 1
       ) u ON true
       ORDER BY t.id ASC`
    );

    for (const t of allTenants.rows) {
      let needsSubUpdate = false;
      let nextAppKey = t.app_key && t.app_key.trim() ? t.app_key.trim() : '';
      if (!nextAppKey) {
        nextAppKey = await generateUniqueAppKey();
        needsSubUpdate = true;
      }

      const nextPlan = normalizeSubscriptionPlan(t.subscription_plan || 'YEARLY');
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
        ownerEmail: t.owner_email || undefined,
        ownerPhone: t.owner_phone || undefined,
        createCashier: false,
      });
    }

    await syncExpiredTenantSubscriptions();

    // 3. Ensure Global SuperAdmin User exists (strictly ONE superadmin: talhah.jan@gmail.com / Khalid@123)
    const saUserId = await ensureSuperAdminAccount();

    // Purge any store_requests that match previously deleted slugs
    await pgClient.query(
      `DELETE FROM store_requests
       WHERE LOWER(requested_slug) IN (
         SELECT LOWER(requested_slug)
         FROM deleted_store_requests
         WHERE requested_slug NOT IN ('__reseed_cleanup_done__', '__seeded_stores_and_requests_removed_v1__', '__schema_v5_ready__', '__schema_v6_talhah_ready__')
       )`
    );

    await pgClient
      .query(
        `INSERT INTO deleted_store_requests (request_id, requested_slug) VALUES (0, '__schema_v6_talhah_ready__')`
      )
      .catch(() => {});

    saasControlPlaneInitialized = true;
  } catch (err: any) {
    console.warn('Notice during SaaS control plane initialization:', err?.message || err);
  } finally {
    saasControlPlanePromise = null;
  }
  })();

  return saasControlPlanePromise;
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
