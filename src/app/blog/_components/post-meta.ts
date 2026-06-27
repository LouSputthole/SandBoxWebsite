/**
 * Presentation helpers for the Arcade blog index.
 *
 * Maps a BlogPost `kind` (the real DB enum-ish string) to its display
 * label + signal color, and produces a *decorative* sparkline series for
 * a post. Posts don't carry a price series, so the chart art is generated
 * deterministically from the slug — stable per post, varied across the
 * grid, purely cosmetic (matches the mockup's per-card chart headers).
 */

export interface TagMeta {
  /** Human label shown on the chip / eyebrow. */
  label: string;
  /** Signal color (a CSS var reference) driving chip, spark, hover border. */
  color: string;
}

/**
 * `kind` → tag. The four mockup tags map onto the real kinds we persist:
 *   monday-outlook  → "Monday outlook"  (brand accent / purple)
 *   weekly-report   → "Friday wrap"     (rare blue)
 *   market-analysis → "Analysis"        (legendary violet)
 *   announcement    → "Store rotation"  (up green)
 * Anything else (or null) falls back to a neutral accent "Report".
 */
const TAGS: Record<string, TagMeta> = {
  "monday-outlook": { label: "Monday outlook", color: "var(--accent)" },
  "weekly-report": { label: "Friday wrap", color: "var(--rarity-rare)" },
  "market-analysis": { label: "Analysis", color: "var(--rarity-legendary)" },
  announcement: { label: "Store rotation", color: "var(--up)" },
};

export function getTagMeta(kind: string | null | undefined): TagMeta {
  if (kind && TAGS[kind]) return TAGS[kind];
  return { label: "Report", color: "var(--accent)" };
}

/** FNV-1a → 32-bit unsigned hash, used to seed the decorative series. */
function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Deterministic, cosmetic value series for a post's chart art. Not real
 * market data — seeded from the slug so each post keeps a stable shape.
 */
export function decorativeSeries(slug: string, points = 11): number[] {
  let seed = hashString(slug) || 1;
  const rand = () => {
    // xorshift32
    seed ^= seed << 13;
    seed >>>= 0;
    seed ^= seed >> 17;
    seed ^= seed << 5;
    seed >>>= 0;
    return seed / 4294967296;
  };
  const out: number[] = [];
  let v = 35 + rand() * 35;
  for (let i = 0; i < points; i++) {
    v += (rand() - 0.42) * 16;
    v = Math.max(8, Math.min(95, v));
    out.push(Math.round(v * 10) / 10);
  }
  return out;
}

/** US short date used across the index (mono in the UI). */
export function formatPostDate(date: Date): string {
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
