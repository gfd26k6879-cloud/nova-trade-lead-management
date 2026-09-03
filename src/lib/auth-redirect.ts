const DEFAULT_AUTH_NEXT_PATH = "/reset-password";
const ASCII_CONTROL_CHARACTER = /[\u0000-\u001f\u007f]/u;

/**
 * Keeps authentication callbacks on an application-local absolute path.
 * Backslashes are rejected from the pathname because URL parsers normalize
 * them as path separators and can turn `/\\host` into a network-path
 * redirect. Query and fragment data may contain literal backslashes safely.
 */
export function normalizeAuthNextPath(next: string | null | undefined): string {
  const pathnameEnd = next ? firstDelimiterIndex(next) : 0;
  const pathname = next?.slice(0, pathnameEnd) ?? "";
  if (
    !next ||
    !next.startsWith("/") ||
    next.startsWith("//") ||
    pathname.includes("\\") ||
    ASCII_CONTROL_CHARACTER.test(next)
  ) {
    return DEFAULT_AUTH_NEXT_PATH;
  }

  return next;
}

function firstDelimiterIndex(value: string): number {
  const queryIndex = value.indexOf("?");
  const fragmentIndex = value.indexOf("#");
  const indexes = [queryIndex, fragmentIndex].filter((index) => index >= 0);
  return indexes.length === 0 ? value.length : Math.min(...indexes);
}
