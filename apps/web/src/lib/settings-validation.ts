/**
 * Client-side validation for workspace settings (name, slug).
 * Used by the settings page to validate before calling the API.
 */

/** Slug must be lowercase alphanumeric and hyphens only (URL-safe). */
export const SLUG_REGEX = /^[a-z0-9-]+$/;

export const ACCOUNT_NAME_MIN_LEN = 1;
export const ACCOUNT_NAME_MAX_LEN = 100;

/**
 * Returns true if the slug matches the allowed format (lowercase, alphanumeric, hyphens).
 */
export function isValidSlug(slug: string): boolean {
  return slug.length > 0 && SLUG_REGEX.test(slug);
}

export interface ValidateAccountNameResult {
  valid: boolean;
  error?: string;
}

/**
 * Validates workspace name length. Returns { valid: true } or { valid: false, error }.
 */
export function validateAccountName(name: string): ValidateAccountNameResult {
  const trimmed = name.trim();
  if (trimmed.length < ACCOUNT_NAME_MIN_LEN) {
    return { valid: false, error: "Account name is required" };
  }
  if (trimmed.length > ACCOUNT_NAME_MAX_LEN) {
    return { valid: false, error: `Account name must be ${ACCOUNT_NAME_MAX_LEN} characters or less` };
  }
  return { valid: true };
}
