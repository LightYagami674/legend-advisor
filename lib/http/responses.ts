/**
 * Builds a JSON `Response` with the given status code.
 */
export function jsonResponse(data: unknown, status: number = 200): Response {
  return Response.json(data, { status });
}

/**
 * Parses a positive integer ID from a route param or query string, returning `null` if invalid.
 */
export function parsePositiveIntId(
  raw: string | null | undefined,
): number | null {
  if (raw === null || raw === undefined || raw.trim() === "") return null;
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) return null;
  return id;
}
