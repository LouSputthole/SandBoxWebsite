import { prisma } from "@/lib/db";

/**
 * Database size + row-count intelligence. Reads Postgres' own catalog
 * views — `pg_total_relation_size` (includes indexes + TOAST) for real
 * storage numbers, and the catalog's live row estimates (fast but
 * approximate) for counts.
 *
 * Used by the `/admin/storage` dashboard and by the downsampler's
 * before/after reports so the operator can see the actual impact of a
 * cleanup run.
 */

export interface TableStats {
  name: string;
  rowCount: number;
  totalBytes: number;
  totalSizePretty: string;
  indexBytes: number;
  indexSizePretty: string;
}

export interface DatabaseStats {
  totalBytes: number;
  totalSizePretty: string;
  tables: TableStats[];
  /** Estimated monthly growth if the trend from the last 30d holds. */
  projectedMonthlyGrowthBytes: number | null;
}

export async function getDatabaseStats(): Promise<DatabaseStats> {
  // Single round-trip to pg catalog for all user tables. `pg_class`
  // `reltuples` is an estimate — precise enough for a dashboard and
  // vastly faster than COUNT(*) on big tables. If an operator needs an
  // exact count they can SELECT COUNT(*) themselves.
  const rows = await prisma.$queryRaw<
    Array<{
      relname: string;
      reltuples: number;
      total_bytes: bigint;
      total_pretty: string;
      index_bytes: bigint;
      index_pretty: string;
    }>
  >`
    SELECT
      c.relname,
      c.reltuples::float8 AS reltuples,
      pg_total_relation_size(c.oid)::bigint AS total_bytes,
      pg_size_pretty(pg_total_relation_size(c.oid)) AS total_pretty,
      pg_indexes_size(c.oid)::bigint AS index_bytes,
      pg_size_pretty(pg_indexes_size(c.oid)) AS index_pretty
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relkind = 'r'
      AND n.nspname = 'public'
    ORDER BY pg_total_relation_size(c.oid) DESC
  `;

  const totalSizeRow = await prisma.$queryRaw<
    [{ total: bigint; pretty: string }]
  >`
    SELECT
      pg_database_size(current_database())::bigint AS total,
      pg_size_pretty(pg_database_size(current_database())) AS pretty
  `;

  const tables: TableStats[] = rows.map((r) => ({
    name: r.relname,
    rowCount: Math.round(r.reltuples),
    totalBytes: Number(r.total_bytes),
    totalSizePretty: r.total_pretty,
    indexBytes: Number(r.index_bytes),
    indexSizePretty: r.index_pretty,
  }));

  // Projected monthly growth — rough signal, not a forecast. Uses the
  // PricePoint table's growth pattern as the proxy since it's the
  // biggest accumulator and grows roughly linearly with catalog size ×
  // sync frequency.
  const growthRow = await prisma.$queryRaw<[{ rows_last_30d: bigint }]>`
    SELECT COUNT(*)::bigint AS rows_last_30d
    FROM "PricePoint"
    WHERE "timestamp" >= NOW() - INTERVAL '30 days'
  `;
  const ppStats = tables.find((t) => t.name === "PricePoint");
  let projectedMonthlyGrowthBytes: number | null = null;
  if (ppStats && ppStats.rowCount > 0) {
    const last30dRows = Number(growthRow[0].rows_last_30d);
    // bytes-per-row (approx) = totalBytes / rowCount. Then × last 30d
    // row count = extrapolated monthly growth.
    const bytesPerRow = ppStats.totalBytes / Math.max(ppStats.rowCount, 1);
    projectedMonthlyGrowthBytes = Math.round(bytesPerRow * last30dRows);
  }

  return {
    totalBytes: Number(totalSizeRow[0].total),
    totalSizePretty: totalSizeRow[0].pretty,
    tables,
    projectedMonthlyGrowthBytes,
  };
}

export function prettyBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}
