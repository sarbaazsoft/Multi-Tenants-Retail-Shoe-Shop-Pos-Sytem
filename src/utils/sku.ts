/**
 * AUTOMATIC SKU & ARTICLE GENERATION LOGIC (STORE-WIDE PRODUCT NUMBER, NO ZERO-PADDING)
 *
 * Formula:
 * - Store Product ID (N): Per-store count (recycled from deleted_product_ids first, else store COUNT(*) + 1)
 *   Uses exact integer without zero-padding (e.g., 1, 7, 9, 12, 129).
 * - Suggested Article: [2-Letter Category Abbreviation]-[Exact Product ID] (e.g. SN-1, BO-7, TD-12, CA-129)
 * - SKU: [3-Letter Brand Prefix]-[Article]-[Exact Product ID] (e.g. NIK-SN-9-9)
 */

const STANDARD_CATEGORY_PREFIX_MAP: Record<string, string> = {
  MEN: 'MN',
  'MEN SHOES': 'MS',
  "MEN'S SHOES": 'MS',
  MENS: 'MN',
  WOMEN: 'WM',
  'WOMEN SHOES': 'WS',
  "WOMEN'S SHOES": 'WS',
  WOMENS: 'WM',
  LADIES: 'LD',
  'LADIES SHOES': 'LS',
  KIDS: 'KD',
  'KIDS SHOES': 'KS',
  CHILDREN: 'CH',
  TODDLER: 'TD',
  TODDLERS: 'TD',
  'TODDLER SHOES': 'TD',
  INFANT: 'IN',
  INFANTS: 'IN',
  BABY: 'BB',
  SNEAKERS: 'SN',
  SNEAKER: 'SN',
  BOOTS: 'BO',
  BOOT: 'BO',
  CASUAL: 'CA',
  'CASUAL SHOES': 'CS',
  FORMAL: 'FM',
  'FORMAL SHOES': 'FS',
  SPORTS: 'SP',
  'SPORTS SHOES': 'SS',
  RUNNING: 'RN',
  'RUNNING SHOES': 'RS',
  SANDALS: 'SD',
  SANDAL: 'SD',
  'SANDALS & SLIPPERS': 'SS',
  SLIPPERS: 'SL',
  SLIPPER: 'SL',
  CHAPPAL: 'CP',
  LOAFERS: 'LF',
  LOAFER: 'LF',
  SCHOOL: 'SC',
  'SCHOOL SHOES': 'SC',
  JOGGERS: 'JG',
  HEELS: 'HL',
  FLATS: 'FL',
};

export const STANDARD_FOOTWEAR_CATEGORIES: string[] = [
  'Men',
  'Women',
  'Kids',
  'Toddler',
  'Infant',
];

/**
 * Normalizes any category string into one of the 5 pre-saved store footwear categories:
 * Men, Women, Kids, Toddler, Infant
 */
export function normalizeFootwearCategory(raw: string | undefined | null): string {
  const clean = String(raw || '').trim();
  if (!clean) return 'Men';
  const lower = clean.toLowerCase();

  const exact = STANDARD_FOOTWEAR_CATEGORIES.find((c) => c.toLowerCase() === lower);
  if (exact) return exact;

  if (lower === 'toddler' || lower === 'toddlers' || lower.includes('toddler')) {
    return 'Toddler';
  }
  if (lower === 'infant' || lower === 'infants' || lower.includes('infant') || lower.includes('baby')) {
    return 'Infant';
  }
  if (
    lower === 'kids' ||
    lower === 'kid' ||
    lower.includes('kid') ||
    lower.includes('child') ||
    lower.includes('boy') ||
    lower.includes('girl') ||
    lower.includes('school')
  ) {
    return 'Kids';
  }
  if (
    lower === 'women' ||
    lower === 'womens' ||
    lower.startsWith('women ') ||
    lower.includes("women's") ||
    lower.includes('ladies') ||
    lower.includes('heel') ||
    lower.includes('pump') ||
    lower.includes('flat')
  ) {
    return 'Women';
  }
  if (lower === 'men' || lower === 'mens' || lower.startsWith('men ') || lower.includes("men's") || lower.includes('gents')) {
    return 'Men';
  }

  return 'Men';
}

/**
 * Parses abbreviation prefix from a name (default 3-character for Brand)
 */
export function parsePrefix(name: string | undefined | null): string {
  if (!name || typeof name !== 'string') {
    return 'GEN';
  }

  // Remove non-alphanumeric characters while preserving word boundaries
  const cleaned = name
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, ' ')
    .trim();

  // Split into words by whitespace
  const words = cleaned.split(/\s+/).filter(Boolean);

  if (words.length === 0) {
    return 'GEN';
  }

  // Single word
  if (words.length === 1) {
    const word = words[0];
    if (word.length >= 3) {
      return word.slice(0, 3);
    } else {
      return word.padEnd(3, 'X');
    }
  }

  // Two words
  if (words.length === 2) {
    const w1 = words[0];
    const w2 = words[1];
    const firstTwo = w1.slice(0, 2);
    const firstOne = w2.slice(0, 1);
    const combined = firstTwo + firstOne;
    return combined.padEnd(3, 'X');
  }

  // Three or more words
  const prefix = words[0].slice(0, 1) + words[1].slice(0, 1) + words[2].slice(0, 1);
  return prefix.padEnd(3, 'X');
}

export const parseBrandPrefix = parsePrefix;

/**
 * Parses a strictly 2-alphabet abbreviation from Category name.
 *
 * Rules:
 * - Checks canonical footwear category map first (e.g., "Toddler" / "Toddler Shoes" -> "TD")
 * - Single word with 2+ letters: first 2 letters (e.g. "Sneakers" -> "SN", "Boots" -> "BO", "Casual" -> "CA")
 * - Single letter word: pad with "X" (e.g. "S" -> "SX")
 * - Two or more words: first letter of word 1 + first letter of word 2 (e.g. "Men Shoes" -> "MS", "Sports Shoes" -> "SS")
 * - Fallback: "CA"
 */
export function parseCategoryPrefix(name: string | undefined | null): string {
  if (!name || typeof name !== 'string') {
    return 'CA';
  }

  const rawUpper = name.toUpperCase().replace(/['’]/g, '').trim();
  if (STANDARD_CATEGORY_PREFIX_MAP[rawUpper]) {
    return STANDARD_CATEGORY_PREFIX_MAP[rawUpper];
  }

  // Keep only alphabetic characters (A-Z)
  const cleaned = rawUpper.replace(/[^A-Z\s]/g, ' ').trim();
  if (STANDARD_CATEGORY_PREFIX_MAP[cleaned]) {
    return STANDARD_CATEGORY_PREFIX_MAP[cleaned];
  }

  const words = cleaned.split(/\s+/).filter(Boolean);

  if (words.length === 0) {
    return 'CA';
  }

  if (words[0] === 'TODDLER' || words[0] === 'TODDLERS') {
    return 'TD';
  }

  if (words.length === 1) {
    const word = words[0];
    if (word.length >= 2) {
      return word.slice(0, 2);
    }
    return word.padEnd(2, 'X');
  }

  // Two or more words: take first letter of word 1 + first letter of word 2
  const firstLetter = words[0].slice(0, 1);
  const secondLetter = words[1].slice(0, 1);
  const combined = `${firstLetter}${secondLetter}`;

  if (combined.length === 2) {
    return combined;
  }
  return combined.padEnd(2, 'X');
}

/**
 * Generates the suggested Article: [2-alphabet Category Abbreviation]-[Product ID padded to 2 digits if 1-9]
 * Adds 1 leading zero ONLY for IDs 1-9 (01..09); IDs 10+ remain exact (10, 12, 129):
 * e.g., Category = "Men" ("MN"), Product ID = 1 -> "MN-01"
 * e.g., Category = "Women" ("WM"), Product ID = 9 -> "WM-09"
 * e.g., Category = "Toddler" ("TD"), Product ID = 12 -> "TD-12"
 * e.g., Category = "Men" ("MN"), Product ID = 129 -> "MN-129"
 */
export function generateSuggestedArticle(
  categoryPrefixOrName: string | undefined | null,
  productId: number | string | undefined | null
): string {
  const cleanInput = String(categoryPrefixOrName || '').trim().toUpperCase();
  const prefix =
    /^[A-Z]{2}$/.test(cleanInput) ? cleanInput : parseCategoryPrefix(categoryPrefixOrName);
  const id = Math.max(1, parseInt(String(productId ?? '').replace(/\D/g, ''), 10) || 1);
  const formattedId = id >= 1 && id <= 9 ? `0${id}` : String(id);
  return `${prefix}-${formattedId}`;
}

/**
 * Generates the automated SKU: [Brand Prefix]-[Article Number]-[Product ID]
 * Format: ${brandCode}-${articleNumber}-${productId} (e.g., NIK-MN-09-9)
 */
export function generateSku(
  brandPrefixOrName: string | undefined | null,
  article: string | undefined | null,
  productIdInput?: number | string | null
): string {
  const cleanBrandInput = String(brandPrefixOrName || '').trim().toUpperCase();
  const brandCode =
    /^[A-Z0-9]{3}$/.test(cleanBrandInput) ? cleanBrandInput : parseBrandPrefix(brandPrefixOrName);
  const idNum =
    productIdInput !== undefined && productIdInput !== null
      ? Math.max(1, parseInt(String(productIdInput).replace(/\D/g, ''), 10) || 1)
      : null;
  const articleNumber = (
    article || (idNum ? generateSuggestedArticle('MN', idNum) : 'MN-01')
  )
    .toUpperCase()
    .trim();

  return idNum !== null ? `${brandCode}-${articleNumber}-${idNum}` : `${brandCode}-${articleNumber}`;
}

export interface SkuComponents {
  brandPrefix: string;
  categoryPrefix?: string;
  article: string;
  productId: number;
  sku: string;
  barcode: string;
  formula: string;
}

/**
 * Helper to build all components together.
 */
export function buildSkuInfo(
  brandName: string | undefined | null,
  categoryOrArticle: string | undefined | null,
  articleInput?: number | string | null,
  productIdInput?: number | string | undefined | null
): SkuComponents {
  const brandPrefix = parseBrandPrefix(brandName);

  let categoryPrefix = 'CA';
  let article = '';
  let productId = 1;

  if (productIdInput !== undefined && productIdInput !== null) {
    categoryPrefix = parseCategoryPrefix(categoryOrArticle);
    const rawVal = String(productIdInput).trim();
    productId = Math.max(1, parseInt(rawVal.replace(/\D/g, ''), 10) || 1);
    const artInput = typeof articleInput === 'string' ? articleInput : '';
    article =
      artInput && artInput.trim()
        ? artInput.trim().toUpperCase()
        : generateSuggestedArticle(categoryPrefix, productId);
  } else if (
    typeof articleInput === 'number' ||
    (typeof articleInput === 'string' && /^\d+$/.test(articleInput.trim()))
  ) {
    categoryPrefix = parseCategoryPrefix(categoryOrArticle);
    productId = Math.max(1, parseInt(String(articleInput).replace(/\D/g, ''), 10) || 1);
    article = generateSuggestedArticle(categoryPrefix, productId);
  } else {
    article =
      categoryOrArticle && categoryOrArticle.trim()
        ? categoryOrArticle.trim().toUpperCase()
        : generateSuggestedArticle('CA', 1);
  }

  const sku = generateSku(brandPrefix, article, productId);
  const barcode = `${categoryPrefix}-${productId}`;

  return {
    brandPrefix,
    categoryPrefix,
    article,
    productId,
    sku,
    barcode,
    formula: `[${brandPrefix}]-[${article}]-[${productId}]`,
  };
}
