"use client";

import { useEffect, useState } from "react";
import { formatRemaining } from "./format-remaining";

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
