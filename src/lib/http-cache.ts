export const NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0, must-revalidate, no-transform",
  Pragma: "no-cache",
  Expires: "0",
} as const;

export function applyNoStoreHeaders<T extends { headers: Headers }>(response: T): T {
  for (const [key, value] of Object.entries(NO_STORE_HEADERS)) {
    response.headers.set(key, value);
  }
  return response;
}
