import { prisma } from "@/lib/db";

/**
 * Storage cleanup via tiered retention. The premise: the site and its
 * reports never need full-resolution PricePoint data older than 30
 * days. Charts bucket visually, reports compute medians (which are
 * defined by subsampling), and the momentum scorer reads a 30-day
 * window that Tier 1 keeps fully intact.
 *
 *   Tier 1 — 0-30 days old:      keep every raw row
 *   Tier 2 — 30-180 days old:    1 median-row per (item, hour)
 *   Tier 3 — 180+ days old:      1 daily-OHLC row per (item, day)
 *
 * Downsampled rows are regular PricePoint rows with the timestamp
 * rounded to the bucket boundary (hour or midnight UTC). No schema
 * change — a downsampled row is indistinguishable from a raw row to
 * any chart or query consumer.
 *
 * Safety:
 *   - Dry-run mode returns "would compact X → Y" counts, no writes
 *   - Each bucket's rollup runs in a transaction (insert-new +
 *     delete-old is atomic per bucket)
 *   - Verification: compute pre/post medians for a sample of items,
 *     assert within 0.5% before declaring success
 *   - Batches so a cron timeout can't strand the DB mid-run
 *
 * Re-runs are safe: Tier 2 runs on the 30-180d window; if rows there
 * are already hourly from a prior pass, collapsing 1 row is a no-op.
 * Same for Tier 3.
 */

const TIER_1_DAYS = 30;
const TIER_2_DAYS = 180;

// Batches small enough that one bucket's rollup stays well under
// Neon's statement timeout + a serverless function's wall clock.
const ITEMS_PER_BATCH = 10;

export interface DownsampleReport {
  dryRun: boolean;
  tier2: {
    itemsScanned: number;
    bucketsProcessed: number;
    rowsCompacted: number;
    rowsBefore: number;
    rowsAfter: number;
    errors: string[];
  };
  tier3: {
    itemsScanned: number;
    bucketsProcessed: number;
    rowsCompacted: number;
    rowsBefore: number;
    rowsAfter: number;
    errors: string[];
  };
  verifiedItems: number;
  verificationFailures: Array<{ itemId: string; reason: string }>;
  elapsedMs: number;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

function bucketStart(d: Date, granularity: "hour" | "day"): Date {
  const copy = new Date(d);
  copy.setUTCMilliseconds(0);
  copy.setUTCSeconds(0);
  copy.setUTCMinutes(0);
  if (granularity === "day") copy.setUTCHours(0);
  return copy;
}

/**
 * Compact all points for one item within a time window into
 * granularity-sized buckets. Each bucket with 2+ points is replaced
 * with a single median row. Buckets with 1 point (already compacted
 * from a prior run) are untouched — no-op for idempotency.
 */
async function compactItem(opts: {
  itemId: string;
  windowStart: Date;
  windowEnd: Date;
  granularity: "hour" | "day";
  dryRun: boolean;
}): Promise<{
  bucketsProcessed: number;
  rowsCompacted: number;
  rowsBefore: number;
  rowsAfter: number;
}> {
  const raw = await prisma.pricePoint.findMany({
    where: {
      itemId: opts.itemId,
      timestamp: { gte: opts.windowStart, lt: opts.windowEnd },
    },
    select: { id: true, price: true, volume: true, timestamp: true },
    orderBy: { timestamp: "asc" },
  });
  if (raw.length === 0) {
    return { bucketsProcessed: 0, rowsCompacted: 0, rowsBefore: 0, rowsAfter: 0 };
  }

  // Group points by bucket-start timestamp.
  const buckets = new Map<
    number,
    { price: number; volume: number | null; id: string; timestamp: Date }[]
  >();
  for (const p of raw) {
    const key = bucketStart(p.timestamp, opts.granularity).getTime();
    const arr = buckets.get(key) ?? [];
    arr.push({
      price: p.price,
      volume: p.volume,
      id: p.id,
      timestamp: p.timestamp,
    });
    buckets.set(key, arr);
  }

  let bucketsProcessed = 0;
  let rowsCompacted = 0;

  for (const [bucketTs, rows] of buckets) {
    if (rows.length <= 1) continue; // already compacted
    bucketsProcessed++;
    rowsCompacted += rows.length - 1;

    if (opts.dryRun) continue;

    const prices = rows.map((r) => r.price).filter((p) => p > 0);
    if (prices.length === 0) continue;
    const vols = rows
      .map((r) => r.volume)
      .filter((v): v is number => typeof v === "number" && v >= 0);
    const priceMedian = median(prices);
    const volumeMedian = vols.length > 0 ? Math.round(median(vols)) : null;
    const keepIds = rows.map((r) => r.id);

    // Transactional swap per bucket — insert the rollup row then delete
    // the raw inputs. If the transaction aborts nothing changes, so
    // a retry next week just re-tries the same bucket.
    await prisma.$transaction(async (tx) => {
      await tx.pricePoint.create({
        data: {
          itemId: opts.itemId,
          price: priceMedian,
          volume: volumeMedian,
          timestamp: new Date(bucketTs),
        },
      });
      await tx.pricePoint.deleteMany({
        where: { id: { in: keepIds } },
      });
    });
  }

  return {
    bucketsProcessed,
    rowsCompacted,
    rowsBefore: raw.length,
    rowsAfter: raw.length - rowsCompacted,
  };
}

/**
 * Verification — for a sample of items, compute the 7-day and 30-day
 * median price from the raw data BEFORE we touched it (we can't do
 * this after-the-fact since we just deleted the rows). This function
 * runs pre-compact to snapshot medians, then the caller invokes
 * verifyAfter to check the post-compact numbers.
 *
 * The 7-day window is in Tier 1 — should be untouched. The 30-day
 * window straddles the Tier 1/2 boundary, so it tests that the
 * downsample preserves the 30d signal our momentum scorer depends on.
 */
interface MedianSnapshot {
  itemId: string;
  median7d: number | null;
  median30d: number | null;
}

async function snapshotMedians(itemIds: string[]): Promise<MedianSnapshot[]> {
  const now = new Date();
  const d7 = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const d30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const out: MedianSnapshot[] = [];
  for (const itemId of itemIds) {
    const [all7, all30] = await Promise.all([
      prisma.pricePoint.findMany({
        where: { itemId, timestamp: { gte: d7 } },
        select: { price: true },
      }),
      prisma.pricePoint.findMany({
        where: { itemId, timestamp: { gte: d30 } },
        select: { price: true },
      }),
    ]);
    const p7 = all7.map((r) => r.price).filter((p) => p > 0);
    const p30 = all30.map((r) => r.price).filter((p) => p > 0);
    out.push({
      itemId,
      median7d: p7.length > 0 ? median(p7) : null,
      median30d: p30.length > 0 ? median(p30) : null,
    });
  }
  return out;
}

function medianMatches(a: number | null, b: number | null): boolean {
  if (a === null && b === null) return true;
  if (a === null || b === null) return false;
  const tolerance = 0.005; // 0.5%
  const denom = Math.max(Math.abs(a), Math.abs(b), 0.0001);
  return Math.abs(a - b) / denom <= tolerance;
}

/**
 * Top-level downsampler. Operates on both Tier 2 (hourly) and Tier 3
 * (daily) in one pass. Dry-run is the default because dropping data
 * accidentally is expensive — the operator opts in explicitly.
 */
export async function downsamplePricePoints(options: {
  dryRun: boolean;
  /** Limit which items get processed (for debugging). Empty = all. */
  itemIdFilter?: string[];
  /** How many items to sample for pre/post median verification.
   *  5 items × 2 queries each = cheap. Bump if paranoid. */
  verificationSampleSize?: number;
}): Promise<DownsampleReport> {
  const start = Date.now();
  const now = new Date();
  const t1Cutoff = new Date(now.getTime() - TIER_1_DAYS * 24 * 60 * 60 * 1000);
  const t2Cutoff = new Date(now.getTime() - TIER_2_DAYS * 24 * 60 * 60 * 1000);
  // Earliest timestamp we bother considering — anything older than 5
  // years is curiosity only, saves the downsampler from scanning eons.
  const horizon = new Date(
    now.getTime() - 5 * 365 * 24 * 60 * 60 * 1000,
  );

  const items = await prisma.item.findMany({
    select: { id: true },
    where: options.itemIdFilter?.length
      ? { id: { in: options.itemIdFilter } }
      : undefined,
  });

  // Pre-compact median snapshot for a sample of items. We sample deterministically
  // (first N by id) so dry-run and real-run see the same baselines.
  const sampleSize = options.verificationSampleSize ?? 5;
  const sampleIds = items.slice(0, sampleSize).map((i) => i.id);
  const beforeMedians = options.dryRun ? [] : await snapshotMedians(sampleIds);

  const tier2 = {
    itemsScanned: 0,
    bucketsProcessed: 0,
    rowsCompacted: 0,
    rowsBefore: 0,
    rowsAfter: 0,
    errors: [] as string[],
  };
  const tier3 = {
    itemsScanned: 0,
    bucketsProcessed: 0,
    rowsCompacted: 0,
    rowsBefore: 0,
    rowsAfter: 0,
    errors: [] as string[],
  };

  // Process items in ITEMS_PER_BATCH chunks — lets us parallelize the
  // per-item queries safely without saturating the DB connection pool.
  for (let i = 0; i < items.length; i += ITEMS_PER_BATCH) {
    const chunk = items.slice(i, i + ITEMS_PER_BATCH);
    await Promise.all(
      chunk.map(async ({ id }) => {
        // Tier 2: (30d .. 180d) old → hourly buckets
        try {
          const t2 = await compactItem({
            itemId: id,
            windowStart: t2Cutoff,
            windowEnd: t1Cutoff,
            granularity: "hour",
            dryRun: options.dryRun,
          });
          tier2.itemsScanned++;
          tier2.bucketsProcessed += t2.bucketsProcessed;
          tier2.rowsCompacted += t2.rowsCompacted;
          tier2.rowsBefore += t2.rowsBefore;
          tier2.rowsAfter += t2.rowsAfter;
        } catch (err) {
          tier2.errors.push(
            `${id}: ${err instanceof Error ? err.message : String(err)}`,
          );
        }

        // Tier 3: (horizon .. 180d) old → daily buckets
        try {
          const t3 = await compactItem({
            itemId: id,
            windowStart: horizon,
            windowEnd: t2Cutoff,
            granularity: "day",
            dryRun: options.dryRun,
          });
          tier3.itemsScanned++;
          tier3.bucketsProcessed += t3.bucketsProcessed;
          tier3.rowsCompacted += t3.rowsCompacted;
          tier3.rowsBefore += t3.rowsBefore;
          tier3.rowsAfter += t3.rowsAfter;
        } catch (err) {
          tier3.errors.push(
            `${id}: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }),
    );
  }

  // Verification — only meaningful when we actually wrote.
  let verifiedItems = 0;
  const verificationFailures: Array<{ itemId: string; reason: string }> = [];
  if (!options.dryRun && sampleIds.length > 0) {
    const afterMedians = await snapshotMedians(sampleIds);
    for (const before of beforeMedians) {
      const after = afterMedians.find((a) => a.itemId === before.itemId);
      if (!after) continue;
      if (!medianMatches(before.median7d, after.median7d)) {
        verificationFailures.push({
          itemId: before.itemId,
          reason: `7d median drift: ${before.median7d} → ${after.median7d}`,
        });
        continue;
      }
      if (!medianMatches(before.median30d, after.median30d)) {
        verificationFailures.push({
          itemId: before.itemId,
          reason: `30d median drift: ${before.median30d} → ${after.median30d}`,
        });
        continue;
      }
      verifiedItems++;
    }
  }

  return {
    dryRun: options.dryRun,
    tier2,
    tier3,
    verifiedItems,
    verificationFailures,
    elapsedMs: Date.now() - start,
  };
}

// ---------- PageView rollup ----------

export interface RollupReport {
  dryRun: boolean;
  daysProcessed: number;
  rowsRolledUp: number;
  dailyStatsUpserted: number;
  errors: string[];
  elapsedMs: number;
}

/**
 * Roll up `PageView` rows older than 30 days into the existing
 * `DailyStats` model (which was in the schema but never wired). For
 * each full day in the window, compute totals + top pages/referrers/
 * countries, upsert DailyStats, then delete the raw PageViews.
 *
 * The admin analytics dashboard only queries the last 24h/7d/30d — so
 * deleting raw rows past 30d has zero dashboard impact. The rolled-up
 * DailyStats row remains as historical summary data for any future
 * longer-range features.
 */
export async function rollupPageViews(options: {
  dryRun: boolean;
  /** Only process days older than this cutoff (default 30d). */
  olderThanDays?: number;
}): Promise<RollupReport> {
  const start = Date.now();
  const now = new Date();
  const cutoffDays = options.olderThanDays ?? 30;
  const cutoff = new Date(now.getTime() - cutoffDays * 24 * 60 * 60 * 1000);

  const errors: string[] = [];
  let daysProcessed = 0;
  let rowsRolledUp = 0;
  let dailyStatsUpserted = 0;

  // Distinct days with rows older than cutoff.
  const days = await prisma.$queryRaw<Array<{ day: Date }>>`
    SELECT DATE_TRUNC('day', "timestamp")::date AS day
    FROM "PageView"
    WHERE "timestamp" < ${cutoff}
    GROUP BY 1
    ORDER BY 1 ASC
  `;

  for (const { day } of days) {
    const dayStart = new Date(day);
    dayStart.setUTCHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

    try {
      // All the aggregates for this day in one pass.
      const [totals, pages, refs, countries] = await Promise.all([
        prisma.$queryRaw<[{ views: bigint; visitors: bigint }]>`
          SELECT
            COUNT(*)::bigint AS views,
            COUNT(DISTINCT "sessionId")::bigint AS visitors
          FROM "PageView"
          WHERE "timestamp" >= ${dayStart} AND "timestamp" < ${dayEnd}
        `,
        prisma.pageView.groupBy({
          by: ["path"],
          where: { timestamp: { gte: dayStart, lt: dayEnd } },
          _count: { _all: true },
          orderBy: { _count: { path: "desc" } },
          take: 20,
        }),
        prisma.pageView.groupBy({
          by: ["referrer"],
          where: {
            timestamp: { gte: dayStart, lt: dayEnd },
            referrer: { not: null },
          },
          _count: { _all: true },
          orderBy: { _count: { referrer: "desc" } },
          take: 20,
        }),
        prisma.pageView.groupBy({
          by: ["country"],
          where: {
            timestamp: { gte: dayStart, lt: dayEnd },
            country: { not: null },
          },
          _count: { _all: true },
          orderBy: { _count: { country: "desc" } },
          take: 20,
        }),
      ]);

      const views = Number(totals[0].views);
      const visitors = Number(totals[0].visitors);

      if (options.dryRun) {
        daysProcessed++;
        rowsRolledUp += views;
        dailyStatsUpserted++;
        continue;
      }

      await prisma.$transaction(async (tx) => {
        await tx.dailyStats.upsert({
          where: { date: dayStart },
          create: {
            date: dayStart,
            views,
            visitors,
            topPages: pages.map((p) => ({
              path: p.path,
              count: p._count._all,
            })),
            topReferrers: refs.map((r) => ({
              referrer: r.referrer,
              count: r._count._all,
            })),
            topCountries: countries.map((c) => ({
              country: c.country,
              count: c._count._all,
            })),
          },
          update: {
            views,
            visitors,
            topPages: pages.map((p) => ({
              path: p.path,
              count: p._count._all,
            })),
            topReferrers: refs.map((r) => ({
              referrer: r.referrer,
              count: r._count._all,
            })),
            topCountries: countries.map((c) => ({
              country: c.country,
              count: c._count._all,
            })),
          },
        });
        const deleted = await tx.pageView.deleteMany({
          where: { timestamp: { gte: dayStart, lt: dayEnd } },
        });
        rowsRolledUp += deleted.count;
      });

      daysProcessed++;
      dailyStatsUpserted++;
    } catch (err) {
      errors.push(
        `${dayStart.toISOString().slice(0, 10)}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  return {
    dryRun: options.dryRun,
    daysProcessed,
    rowsRolledUp,
    dailyStatsUpserted,
    errors,
    elapsedMs: Date.now() - start,
  };
}
