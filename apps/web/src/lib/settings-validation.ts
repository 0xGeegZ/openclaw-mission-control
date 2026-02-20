/**
 * Client-side validation for workspace settings (name, slug).
 * Used by the settings page to validate before calling the API.
 */

/** Slug must be lowercase alphanumeric and hyphens only (URL-safe). */
export const SLUG_REGEX = /^[a-z0-9-]+$/;

export const ACCOUNT_NAME_MIN_LEN = 1;
export const ACCOUNT_NAME_MAX_LEN = 100;

/** Max length for account-shared USER.md (must match backend USER_MD_MAX_LENGTH). */
export const USER_MD_MAX_LENGTH = 50_000;

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
    return {
      valid: false,
      error: `Account name must be ${ACCOUNT_NAME_MAX_LEN} characters or less`,
    };
  }
  return { valid: true };
}

export interface ValidateUserMdResult {
  valid: boolean;
  error?: string;
}

/**
 * Validates USER.md content length. Returns { valid: true } or { valid: false, error }.
 */
export function validateUserMd(content: string): ValidateUserMdResult {
  if (content.length > USER_MD_MAX_LENGTH) {
    return {
      valid: false,
      error: `Agent profile must be ${USER_MD_MAX_LENGTH.toLocaleString()} characters or less (got ${content.length.toLocaleString()})`,
    };
  }
  return { valid: true };
}
