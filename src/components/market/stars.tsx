import { Star } from "lucide-react";

/**
 * Read-only 5-star display. `value` is 0..5 (may be fractional — the last partial star is rounded to
 * the nearest half visually via a clip). Presentational + pure, safe in a server component.
 */
export function Stars({ value, size = 14 }: { value: number; size?: number }) {
  const clamped = Math.max(0, Math.min(5, value));
  return (
    <span className="inline-flex items-center" aria-label={`${clamped} out of 5 stars`}>
      {[0, 1, 2, 3, 4].map((i) => {
        const fill = Math.max(0, Math.min(1, clamped - i)); // 0..1 fraction of this star filled
        return (
          <span key={i} className="relative inline-block" style={{ width: size, height: size }}>
            <Star className="absolute inset-0 text-line" style={{ width: size, height: size }} strokeWidth={1.5} />
            {fill > 0 ? (
              <span className="absolute inset-0 overflow-hidden" style={{ width: `${fill * 100}%` }}>
                <Star
                  className="text-accent"
                  style={{ width: size, height: size }}
                  fill="currentColor"
                  strokeWidth={1.5}
                />
              </span>
            ) : null}
          </span>
        );
      })}
    </span>
  );
}
