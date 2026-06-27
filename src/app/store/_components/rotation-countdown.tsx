"use client";

import { useEffect, useState } from "react";
import { Clock } from "lucide-react";
import { daysUntil, formatRemaining, leavingLabel } from "./format-remaining";

/**
 * The live "4d 11h" rotation countdown — the only client state on the store
 * page. Seeds from a server-computed `initialLabel` so the first client render
 * matches the SSR markup (no hydration mismatch / no flash), then re-ticks once
 * a minute against the wall clock.
 */
export function RotationCountdown({
  endsAt,
  initialLabel,
}: {
  endsAt: string;
  initialLabel: string;
}) {
  const [label, setLabel] = useState(initialLabel);

  useEffect(() => {
    const target = new Date(endsAt).getTime();
    const tick = () => setLabel(formatRemaining(target - Date.now()));
    tick();
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, [endsAt]);

  return <div className="font-mono text-[18px] font-bold text-accent">{label}</div>;
}

/** Days-left → urgency text color. <=2d (incl. today) reads as down/red, the
 *  next week as the amber tool tint, anything further out (or unknown) muted. */
function leavingTone(days: number | null): string {
  if (days == null) return "text-faint";
  if (days <= 2) return "text-down";
  if (days <= 7) return "text-cat-tool";
  return "text-mut";
}

/**
 * Per-item delisting countdown chip — "Leaving today / N days left" with a
 * Clock glyph and color urgency. Seeds from a server-computed `initialDays`
 * (so SSR matches the first client render — no hydration flash), then re-ticks
 * once a minute against the wall clock so a tab left open stays honest.
 *
 * `endsAt` null → the item is rotating but sbox.dev gave us no leaving date;
 * we render a static "Leaving date unknown" with no live ticking.
 */
export function ItemLeavingCountdown({
  endsAt,
  initialDays,
}: {
  endsAt: string | null;
  initialDays: number | null;
}) {
  const [days, setDays] = useState(initialDays);

  useEffect(() => {
    if (!endsAt) return;
    const tick = () => setDays(daysUntil(endsAt));
    tick();
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, [endsAt]);

  return (
    <span
      className={`inline-flex items-center gap-1 font-mono text-[11px] font-medium ${leavingTone(days)}`}
    >
      <Clock className="h-3 w-3" />
      {leavingLabel(days)}
    </span>
  );
}
