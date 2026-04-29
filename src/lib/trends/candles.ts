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

export type Period = "24H" | "7D" | "30D" | "90D" | "ALL";

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

const BUCKET_MS: Record<Period, number> = {
  "24H": 60 * 60 * 1000, // 1h × 24 = 24 candles
  "7D": 4 * 60 * 60 * 1000, // 4h × 42 = 42 candles
  "30D": 24 * 60 * 60 * 1000, // 1d × 30 = 30 candles
  "90D": 3 * 24 * 60 * 60 * 1000, // 3d × 30 = 30 candles
  ALL: 7 * 24 * 60 * 60 * 1000, // 1w buckets, count varies
};

function bucketLabel(start: Date, period: Period): string {
  if (period === "24H") {
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
    candles.push({
      bucket: start.toISOString(),
      label: bucketLabel(start, period),
      open,
      high,
      low,
      close,
      volume,
      lowHigh: [low, high],
      openClose: [Math.min(open, close), Math.max(open, close)],
      direction,
    });
  }
  return candles;
}
