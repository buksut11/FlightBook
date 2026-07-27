/**
 * Helpers for building PostgREST filters out of user-supplied search text.
 *
 * PostgREST's filter argument is a mini-language, not an opaque string:
 * `,` separates terms, `.` separates column/operator/value, `()` groups, and
 * `"` quotes values. Interpolating a raw query parameter into `.or(...)`
 * therefore lets the caller close the intended term and append their own —
 * `x,id.not.is.null` returns every row, and an injected term can reference any
 * column on the table, including ones the UI never exposes, which turns the
 * search box into a blind enumeration oracle.
 *
 * These filters run under the caller's RLS policies, so this is not a
 * privilege boundary on its own — but the pattern must not be allowed to
 * spread to a table with per-row policies, where it would be a data breach.
 */

/** Longest search term we will build a filter from. */
const MAX_TERM_LENGTH = 100;

/**
 * Strip every character that carries meaning to PostgREST's filter parser or
 * to SQL's LIKE, leaving plain search text.
 *
 * Removed:
 *   , . ( ) " \ : *   PostgREST grammar (`*` becomes `%` in like/ilike)
 *   % _               SQL LIKE wildcards, so typed input matches literally
 *   control chars     never meaningful, and can corrupt the request line
 *
 * Apostrophes are deliberately kept — PostgREST binds values as parameters, so
 * `'` is not an injection vector, and names like O'Brien should stay
 * searchable.
 *
 * Returns "" when nothing usable is left; callers must skip the filter
 * entirely in that case rather than searching for an empty pattern.
 */
export function sanitizeSearchTerm(input: string | undefined | null): string {
  if (!input) return "";
  return input
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/[,.()"\\:*%_]/g, "")
    .trim()
    .slice(0, MAX_TERM_LENGTH);
}

/**
 * Build the `or(...)` argument matching a term against a customer's name or
 * phone. Returns null when the term sanitizes to nothing, meaning "apply no
 * filter" — which is different from "match nothing".
 */
export function customerSearchFilter(input: string | undefined | null): string | null {
  const safe = sanitizeSearchTerm(input);
  if (!safe) return null;
  return `full_name.ilike.%${safe}%,phone.ilike.%${safe}%`;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Guard for values interpolated into a PostgREST `in.(...)` list. These ids
 * come from a previous query today rather than from the user, so this is
 * defence in depth against that changing — an `in.()` list is built by string
 * concatenation and has the same grammar problem as `or()`.
 */
export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}
