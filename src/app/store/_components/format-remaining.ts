/**
 * Remaining-time formatter for the store-rotation countdown.
 *
 * Renders the coarse "4d 11h" / "11h 30m" / "30m" style shown in the Arcade
 * mockup (mono, accent). Pure given its `ms` argument so it's safe to call in
 * a render body; `formatRemainingUntil` wraps `Date.now()` so callers (incl.
 * server render) keep the clock read out of their own render bodies.
 */
export function formatRemaining(ms: number): string {
  if (ms <= 0) return "ending soon";
  const totalMinutes = Math.floor(ms / 60_000);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

/** `formatRemaining` against now — keeps `Date.now()` out of render bodies. */
export function formatRemainingUntil(iso: string): string {
  return formatRemaining(new Date(iso).getTime() - Date.now());
}
