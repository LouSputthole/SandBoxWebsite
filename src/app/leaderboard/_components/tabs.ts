/**
 * Leaderboard tab identity — shared by the server page (query selection +
 * `?tab=` validation) and the client table (rendering + URL sync). Kept in a
 * plain module (no "use client") so the server can import the keys/validator
 * without pulling the client component across the boundary. The icons + labels
 * live with the client `<LeaderboardTable>` since they reference lucide
 * components.
 */

export type TabKey = "valuable" | "gainers" | "losers" | "listed" | "rarest";

/** Tab order, left to right. Drives both the chips and the query fan-out. */
export const TAB_KEYS: TabKey[] = [
  "valuable",
  "gainers",
  "losers",
  "listed",
  "rarest",
];

/** Landing tab when no (or an invalid) `?tab=` param is present. */
export const DEFAULT_TAB: TabKey = "valuable";

/** Narrow an untrusted `?tab=` value to a known tab. */
export function isValidTab(s: string | undefined): s is TabKey {
  return s !== undefined && (TAB_KEYS as string[]).includes(s);
}
