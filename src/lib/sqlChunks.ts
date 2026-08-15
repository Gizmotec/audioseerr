/**
 * SQLite binds at most 999 parameters into one statement, so a `WHERE id IN
 * (…)` built from a user's selection stops working once the list gets long —
 * Prisma raises P2029 ("query parameter limit supported by your database is
 * exceeded"). Measured against this schema: 990 ids pass, 998 fail, because
 * the rest of the query claims the remaining slots.
 *
 * That ceiling is why bulk actions used to be capped at 200 selected tracks.
 * The cap is gone; anything driven by a selection, a playlist or a whole
 * library has to go through here instead.
 *
 * 500 leaves plenty of head-room for a query's other bound values without
 * anyone having to count them.
 */
const SQL_PARAM_CHUNK = 500;

/** Split a list into batches small enough to bind in one SQLite statement. */
export function chunkForSql<T>(items: T[], size = SQL_PARAM_CHUNK): T[][] {
  if (items.length === 0) return [];
  if (items.length <= size) return [items];
  const batches: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    batches.push(items.slice(i, i + size));
  }
  return batches;
}
