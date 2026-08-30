const DEFAULT_AUTH_NEXT_PATH = "/reset-password";
const ASCII_CONTROL_CHARACTER = /[\u0000-\u001f\u007f]/u;

/**
 * Keeps authentication callbacks on an application-local absolute path.
 * Backslashes are rejected because URL parsers normalize them as path
 * separators and can turn `/\\host` into a network-path redirect.
 */
export function normalizeAuthNextPath(next: string | null | undefined): string {
  if (
    !next ||
    !next.startsWith("/") ||
    next.startsWith("//") ||
    next.includes("\\") ||
    ASCII_CONTROL_CHARACTER.test(next)
  ) {
    return DEFAULT_AUTH_NEXT_PATH;
  }

  return next;
}
