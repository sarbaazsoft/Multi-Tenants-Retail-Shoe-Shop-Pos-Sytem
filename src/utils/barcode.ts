/**
 * AUTOMATIC BARCODE LOGIC (CODE-128 DEFAULT, NO PREFIX, NO ZERO-PADDING)
 *
 * Final Architecture Plan:
 * 1. Default Store Barcode Format: Code-128 (Variable-length alphanumeric/numeric)
 *    - No 7-digit barcode prefix required.
 *    - No leading zero-padding on Product ID (uses exact store product number: 1, 7, 9, 12, 129...).
 *    - Formula: [2-Letter Category Code]-[Exact Store Product ID] (e.g., "SN-9", "BO-7", "TD-12", "CA-129")
 *      or exact product number if no category is given.
 * 2. Full Manufacturer Barcode Override Support:
 *    - Cashiers/Admins can override the designed Code-128 barcode with the shoe box's own barcode:
 *      Code-128 (any length), EAN-13 (13 digits), UPC-A (12 digits), or EAN-8 (8 digits).
 *    - Overriding the barcode NEVER adds the product's ID to deleted_product_ids, keeping store
 *      product counts, Articles, and SKUs 100% synchronized without collision.
 */

import { parseCategoryPrefix } from './sku.ts';

/**
 * Validates barcode prefix (kept non-blocking for backward compatibility since prefix is no longer required).
 */
export function validateBarcodePrefix(_prefix?: string | undefined | null): { isValid: boolean; error?: string } {
  return { isValid: true };
}

/**
 * Sanitizes prefix if provided (backward compatibility helper).
 */
export function sanitizePrefix(prefix: string | undefined | null, defaultPrefix: string = ''): string {
  const digits = String(prefix || '').replace(/\D/g, '');
  return digits || defaultPrefix;
}

/**
 * Formats a Product ID as an exact positive integer string without zero-padding (e.g. "1", "7", "9", "12", "129").
 */
export function formatProductId(productId: number | string): string {
  const parsed = parseInt(String(productId).replace(/\D/g, ''), 10);
  if (isNaN(parsed) || parsed < 1) {
    return '1';
  }
  return String(parsed);
}

/**
 * Calculates standard EAN-13 Modulo-10 check digit for a 12-digit numeric string.
 */
export function calculateEan13CheckDigit(twelveDigits: string): number {
  const cleanDigits = String(twelveDigits).replace(/\D/g, '').slice(0, 12);
  if (cleanDigits.length !== 12) {
    throw new Error(`EAN-13 check digit requires exactly 12 numeric digits, got "${twelveDigits}" (${cleanDigits.length} digits).`);
  }

  let sum = 0;
  for (let i = 0; i < 12; i++) {
    const digit = parseInt(cleanDigits[i], 10);
    sum += digit * (i % 2 === 0 ? 1 : 3);
  }

  const remainder = sum % 10;
  return (10 - remainder) % 10;
}

export interface Ean13BarcodeResult {
  barcode: string;           // Short Code-128 barcode (e.g. "CA-9" or "SN-12")
  prefix: string;            // Category prefix (e.g. "CA", "SN", "TD")
  paddedProductId: string;   // Exact unpadded product ID string (e.g. "9", "12", "129")
  productId: number;         // Exact product ID number
  checkDigit: number;        // 0 (not needed for Code-128)
  format: 'CODE128';
  formula: string;           // e.g. "SN-9"
}

/**
 * Generates an automatic minimum-length Code-128 barcode without barcode prefix or zero-padding:
 * Formula: [2-Letter Category Code]-[Exact Store Product ID] (e.g. "CA-9", "SN-12", "TD-129")
 */
export function generateCode128Barcode(
  productId: number | string,
  categoryOrPrefix?: string | null
): Ean13BarcodeResult {
  const prodIdNum = Math.max(1, parseInt(String(productId ?? '1').replace(/\D/g, ''), 10) || 1);
  const exactIdStr = String(prodIdNum);

  const rawCat = String(categoryOrPrefix || '').trim();
  // If rawCat is a numeric old prefix like '0108923', ignore it and use 'CA' or clean category prefix
  const isLegacyNumericPrefix = /^\d+$/.test(rawCat);
  const catPrefix =
    !rawCat || isLegacyNumericPrefix
      ? 'CA'
      : /^[A-Z]{2}$/i.test(rawCat)
      ? rawCat.toUpperCase()
      : parseCategoryPrefix(rawCat);

  const barcode = `${catPrefix}-${exactIdStr}`;

  return {
    barcode,
    prefix: catPrefix,
    paddedProductId: exactIdStr,
    productId: prodIdNum,
    checkDigit: 0,
    format: 'CODE128',
    formula: barcode,
  };
}

/**
 * Backward-compatible generator used across the app:
 * Now generates the short store Code-128 barcode without prefix or zero-padding.
 * Signature supports:
 * - generateEan13Barcode(categoryOrPrefix, productId)
 * - generateEan13Barcode(productId)
 */
export function generateEan13Barcode(
  prefixOrCategory: string | number | undefined | null,
  productId?: number | string,
  categoryHint?: string | null
): Ean13BarcodeResult {
  if (productId === undefined || productId === null) {
    return generateCode128Barcode(prefixOrCategory || 1, categoryHint || 'CA');
  }
  return generateCode128Barcode(productId, categoryHint || String(prefixOrCategory || 'CA'));
}

/**
 * Validates whether a barcode is a valid 13-digit EAN-13 with matching Modulo-10 check digit.
 */
export function validateEan13(barcode: string): boolean {
  if (!barcode || typeof barcode !== 'string') return false;
  const cleaned = barcode.trim().replace(/\D/g, '');
  if (cleaned.length !== 13) return false;

  const first12 = cleaned.slice(0, 12);
  const checkDigit = parseInt(cleaned[12], 10);
  try {
    return calculateEan13CheckDigit(first12) === checkDigit;
  } catch {
    return false;
  }
}

/**
 * Parses a store barcode (Code-128 like "SN-9" or legacy 13-digit EAN-13) to extract its product ID.
 */
export function parseEan13Barcode(barcode: string): {
  isValid: boolean;
  prefix: string;
  productId: number;
  paddedProductId: string;
  checkDigit: number;
} | null {
  if (!barcode) return null;
  const raw = String(barcode).trim().toUpperCase();

  // Check store Code-128 format: e.g. "SN-9", "TD-12", "CA-129"
  const code128Match = raw.match(/^([A-Z]{2})-?(\d+)$/);
  if (code128Match) {
    const prefix = code128Match[1];
    const idStr = code128Match[2];
    const prodId = parseInt(idStr, 10);
    if (!isNaN(prodId) && prodId >= 1) {
      return {
        isValid: true,
        prefix,
        productId: prodId,
        paddedProductId: String(prodId),
        checkDigit: 0,
      };
    }
  }

  // Legacy 13-digit EAN-13
  const clean = raw.replace(/\D/g, '');
  if (clean.length === 13) {
    const prefix = clean.slice(0, 7);
    const paddedProductId = clean.slice(7, 12);
    const checkDigit = parseInt(clean[12], 10);
    const isValid = validateEan13(clean);

    return {
      isValid,
      prefix,
      productId: parseInt(paddedProductId, 10),
      paddedProductId,
      checkDigit,
    };
  }

  return null;
}

/**
 * Calculates standard UPC-A Modulo-10 check digit for an 11-digit numeric string.
 */
export function calculateUpcACheckDigit(elevenDigits: string): number {
  const clean = String(elevenDigits).replace(/\D/g, '').slice(0, 11);
  if (clean.length !== 11) {
    throw new Error(`UPC-A check digit requires 11 digits, got ${clean.length}.`);
  }
  let sum = 0;
  for (let i = 0; i < 11; i++) {
    const digit = parseInt(clean[i], 10);
    sum += digit * (i % 2 === 0 ? 3 : 1);
  }
  const remainder = sum % 10;
  return (10 - remainder) % 10;
}

/**
 * Calculates standard EAN-8 Modulo-10 check digit for a 7-digit numeric string.
 */
export function calculateEan8CheckDigit(sevenDigits: string): number {
  const clean = String(sevenDigits).replace(/\D/g, '').slice(0, 7);
  if (clean.length !== 7) {
    throw new Error(`EAN-8 check digit requires 7 digits, got ${clean.length}.`);
  }
  let sum = 0;
  for (let i = 0; i < 7; i++) {
    const digit = parseInt(clean[i], 10);
    sum += digit * (i % 2 === 0 ? 3 : 1);
  }
  const remainder = sum % 10;
  return (10 - remainder) % 10;
}

export interface BarcodeAnalysis {
  isValid: boolean;
  standard: 'STORE_CODE128' | 'CODE128' | 'STORE_EAN13' | 'EAN13' | 'UPCA' | 'EAN8' | 'INVALID';
  standardLabel: string;
  expectedCheckDigit?: number;
  actualCheckDigit?: number;
  suggestedFix?: string;
  error?: string;
}

/**
 * Analyzes any scanned or entered barcode string:
 * - Accepts Store Code-128 (e.g. SN-9, TD-12, CA-129) and any length Code-128 (1 to 64 chars)
 * - Validates 13-digit EAN-13, 12-digit UPC-A, and 8-digit EAN-8 manufacturer barcodes (and falls back to Code-128 if non-standard numeric)
 */
export function analyzeBarcode(barcodeRaw: string, _storePrefix?: string): BarcodeAnalysis {
  const raw = String(barcodeRaw || '').trim();
  if (!raw) {
    return {
      isValid: false,
      standard: 'INVALID',
      standardLabel: 'Empty Barcode',
      error: 'Barcode cannot be blank.',
    };
  }

  if (raw.length < 1 || raw.length > 64) {
    return {
      isValid: false,
      standard: 'INVALID',
      standardLabel: 'Invalid Length',
      error: `Barcode length must be between 1 and 64 characters (currently ${raw.length}).`,
    };
  }

  if (/[\r\n\t]/.test(raw)) {
    return {
      isValid: false,
      standard: 'INVALID',
      standardLabel: 'Invalid Format',
      error: 'Barcode contains whitespace or newline characters.',
    };
  }

  const cleanDigits = raw.replace(/\D/g, '');
  const isPureNumeric = cleanDigits.length === raw.length;

  // Check if it matches Store Standard Code-128: [2-letter category]-[exact id] (e.g., SN-9, TD-12, CA-129)
  if (/^[A-Za-z]{2,3}-\d+$/i.test(raw)) {
    return {
      isValid: true,
      standard: 'STORE_CODE128',
      standardLabel: 'Store Standard Code-128 (Compact)',
    };
  }

  // 13-digit numeric: Check EAN-13 first, or accept as 13-digit Code-128
  if (isPureNumeric && raw.length === 13) {
    const first12 = raw.slice(0, 12);
    const actual = parseInt(raw[12], 10);
    const expected = calculateEan13CheckDigit(first12);
    const matches = actual === expected;

    if (matches) {
      return {
        isValid: true,
        standard: 'EAN13',
        standardLabel: 'EAN-13 (13-Digit Retail Standard)',
        expectedCheckDigit: expected,
        actualCheckDigit: actual,
      };
    } else {
      const fixedCode = `${first12}${expected}`;
      return {
        isValid: true,
        standard: 'CODE128',
        standardLabel: 'Code-128 Numeric (13-Digit Box Code)',
        expectedCheckDigit: expected,
        actualCheckDigit: actual,
        suggestedFix: fixedCode,
      };
    }
  }

  // 12-digit numeric: Check UPC-A first, or accept as 12-digit Code-128
  if (isPureNumeric && raw.length === 12) {
    const first11 = raw.slice(0, 11);
    const actual = parseInt(raw[11], 10);
    const expected = calculateUpcACheckDigit(first11);
    const matches = actual === expected;

    if (matches) {
      return {
        isValid: true,
        standard: 'UPCA',
        standardLabel: 'UPC-A (12-Digit Retail Standard)',
        expectedCheckDigit: expected,
        actualCheckDigit: actual,
      };
    } else {
      const fixedCode = `${first11}${expected}`;
      return {
        isValid: true,
        standard: 'CODE128',
        standardLabel: 'Code-128 Numeric (12-Digit Box Code)',
        expectedCheckDigit: expected,
        actualCheckDigit: actual,
        suggestedFix: fixedCode,
      };
    }
  }

  // 8-digit numeric: Check EAN-8 first, or accept as 8-digit Code-128
  if (isPureNumeric && raw.length === 8) {
    const first7 = raw.slice(0, 7);
    const actual = parseInt(raw[7], 10);
    const expected = calculateEan8CheckDigit(first7);
    const matches = actual === expected;

    if (matches) {
      return {
        isValid: true,
        standard: 'EAN8',
        standardLabel: 'EAN-8 (Compact Retail Barcode)',
        expectedCheckDigit: expected,
        actualCheckDigit: actual,
      };
    } else {
      const fixedCode = `${first7}${expected}`;
      return {
        isValid: true,
        standard: 'CODE128',
        standardLabel: 'Code-128 Numeric (8-Digit Box Code)',
        expectedCheckDigit: expected,
        actualCheckDigit: actual,
        suggestedFix: fixedCode,
      };
    }
  }

  // Code-128 / Any length alphanumeric or numeric code (e.g. 9, 12, 129, SN-9, NK-AIR-90)
  if (/^[A-Za-z0-9_\-\.\:\/\#\s]+$/.test(raw)) {
    return {
      isValid: true,
      standard: 'CODE128',
      standardLabel: isPureNumeric
        ? `Code-128 Compact Numeric (${raw.length} chars)`
        : 'Code-128 Barcode (Variable Length)',
    };
  }

  return {
    isValid: false,
    standard: 'INVALID',
    standardLabel: 'Invalid Characters',
    error: 'Barcode contains unsupported non-ASCII characters.',
  };
}
