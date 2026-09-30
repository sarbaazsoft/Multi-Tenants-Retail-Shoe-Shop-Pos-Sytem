/**
 * Utility helpers for Title Case / Capitalize input formatting and sanitization
 * across all forms, with strict exclusions for emails, URLs, passwords,
 * slugs/SKUs/barcodes, and numeric/tax identifiers.
 */

/**
 * Live input formatter: capitalizes the first letter of each word as the user types
 * without altering string length, cursor position, or trailing spaces.
 */
export function toTitleCaseLive(value: string): string {
  if (!value) return '';
  return value.replace(/(^|[\s\-/.,(#])([a-z])/g, (_match, sep: string, char: string) => {
    return sep + char.toUpperCase();
  });
}

/**
 * Trimmed & sanitized Title Case formatter for saving to the database.
 */
export function toTitleCaseTrimmed(value: string | undefined | null): string {
  if (!value) return '';
  return toTitleCaseLive(value.trim());
}

/**
 * Lowercase & trimmed sanitizer for excluded identifier fields (email, website, slug, subdomain).
 */
export function toLowerTrimmed(value: string | undefined | null): string {
  if (!value) return '';
  return value.trim().toLowerCase();
}
