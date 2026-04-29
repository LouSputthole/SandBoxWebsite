/**
 * Aggregate raw market snapshots into OHLC candles for a given period.
 *
 * Snapshots come in at sync cadence (~5-15 min apart). For chart
 * readability we re-bucket into wider intervals matching the period
 * the user selected. Each candle's:
 *   open   = first snapshot's value in the bucket
 *   close  = last snapshot's value in the bucket
 *   high   = max value in the bucket
 *   low    = min value in the bucket
 *
 * Period → bucket size mapping is chosen so every period renders
 * roughly 24-60 candles — enough to see structure, not so many that
 * candles overlap visually.
 */

export type Period = "LIVE" | "24H" | "7D" | "30D" | "90D" | "ALL";

export interface RawSnapshot {
  timestamp: string;
  estMarketCap: number | null;
  listingsValue: number;
  avgPrice: number;
  totalVolume: number;
}

export interface Candle {
  /** Bucket-start timestamp, ISO. */
  bucket: string;
  /** Display label, period-aware. */
  label: string;
  open: number;
  high: number;
  low: number;
  close: number;
  /** Sum of totalVolume across the bucket — used for an optional
   *  volume bar series under the candles. */
  volume: number;
  /** Two-element tuple [low, high] for Recharts wick rendering. */
  lowHigh: [number, number];
  /** Two-element tuple [open, close] sorted ascending for body. */
  openClose: [number, number];
  /** Direction flag for color. */
  direction: "up" | "down" | "flat";
}

export type CandleMetric =
  | "estMarketCap"
  | "listingsValue"
  | "avgPrice"
  | "totalVolume";

// Bucket sizes were tightened to give each candle real OHLC range
// instead of compressing 50+ syncs into one wide candle. Sync runs
// every 15-30min normally + a lightweight 10-min snapshot cron means
// we have ~144-220 snapshots/day to aggregate.
//
// Sweet spot: 4-8 raw points per bucket. Anything fewer flattens the
// candle to a doji; anything more averages out the variance.
const BUCKET_MS: Record<Period, number> = {
  LIVE: 10 * 60 * 1000, // 10m × 36 = last 6h, 1 snapshot/bucket from the 10m cron
  "24H": 30 * 60 * 1000, // 30m × 48 = 48 candles, ~2 syncs/bucket
  "7D": 60 * 60 * 1000, // 1h × 168 = 168 candles, ~4 syncs/bucket
  "30D": 4 * 60 * 60 * 1000, // 4h × 180 = 180 candles, ~12 syncs/bucket
  "90D": 24 * 60 * 60 * 1000, // 1d × 90 = 90 candles, ~144 syncs/bucket
  ALL: 3 * 24 * 60 * 60 * 1000, // 3d buckets, count varies
};

function bucketLabel(start: Date, period: Period): string {
  if (period === "LIVE" || period === "24H") {
    return start.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
    });
  }
  if (period === "7D") {
    return start.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
    });
  }
  return start.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function valueOf(s: RawSnapshot, metric: CandleMetric): number {
  if (metric === "estMarketCap") return s.estMarketCap ?? 0;
  return s[metric];
}

export function bucketize(
  snapshots: RawSnapshot[],
  metric: CandleMetric,
  period: Period,
): Candle[] {
  if (snapshots.length === 0) return [];

  const sorted = [...snapshots].sort(
    (a, b) =>
      new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
  );

  // Drop snapshots where the metric is 0/null — they corrupt the
  // open/close/high/low math (a partial-sync row that hasn't computed
  // estMarketCap yet would otherwise pull a candle to $0).
  const filtered = sorted.filter((s) => valueOf(s, metric) > 0);
  if (filtered.length === 0) return [];

  const bucketMs = BUCKET_MS[period];
  const buckets = new Map<number, RawSnapshot[]>();
  for (const s of filtered) {
    const ts = new Date(s.timestamp).getTime();
    const key = Math.floor(ts / bucketMs) * bucketMs;
    const arr = buckets.get(key) ?? [];
    arr.push(s);
    buckets.set(key, arr);
  }

  const candles: Candle[] = [];
  for (const [key, rows] of [...buckets.entries()].sort(
    (a, b) => a[0] - b[0],
  )) {
    const values = rows.map((r) => valueOf(r, metric));
    const open = values[0];
    const close = values[values.length - 1];
    const high = Math.max(...values);
    const low = Math.min(...values);
    const volume = rows.reduce((s, r) => s + r.totalVolume, 0);
    const direction: Candle["direction"] =
      close > open ? "up" : close < open ? "down" : "flat";
    const start = new Date(key);

    // When a bucket holds a single sync (common in LIVE / 24H views,
    // where bucket width matches sync cadence), open/close/high/low
    // collapse to one value and Recharts renders the body as a 0-px
    // bar (invisible). Pad the body span by 0.05% of the value so the
    // candle still shows up as a thin horizontal line — the
    // conventional "doji" treatment.
    const bodyMin = Math.min(open, close);
    const bodyMax = Math.max(open, close);
    const bodyEpsilon =
      bodyMin === bodyMax ? Math.max(bodyMin * 0.0005, 0.0001) : 0;

    candles.push({
      bucket: start.toISOString(),
      label: bucketLabel(start, period),
      open,
      high,
      low,
      close,
      volume,
      lowHigh: [low, high],
      openClose: [bodyMin - bodyEpsilon, bodyMax + bodyEpsilon],
      direction,
    });
  }
  return candles;
}
