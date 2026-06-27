import { Clock, ShoppingBag } from "lucide-react";
import { formatRemainingUntil } from "./format-remaining";
import { RotationCountdown } from "./rotation-countdown";

/**
 * The accent-tinted "Current store rotation" banner from the Arcade mockup:
 * a shopping-bag glyph + title/subtitle on the left, and a countdown on the
 * right. When the rotation has a known end time (the soonest `leavingStoreAt`
 * across rotating items) we render a live countdown; otherwise we fall back to
 * a static "rotates regularly" line.
 *
 * Server component — only the live number (<RotationCountdown/>) is client.
 */
export function StoreRotationBanner({
  endsAt,
  itemCount,
}: {
  endsAt: string | null;
  itemCount: number;
}) {
  // Server-computed seed for the countdown so SSR shows a real value.
  const initialLabel = endsAt ? formatRemainingUntil(endsAt) : null;

  return (
    <div
      className="relative mb-[30px] flex flex-wrap items-center justify-between gap-5 overflow-hidden rounded-[18px] border px-6 py-5"
      style={{
        borderColor: "color-mix(in srgb, var(--accent) 40%, var(--line))",
        background:
          "linear-gradient(135deg, color-mix(in srgb, var(--accent) 16%, var(--panel)), var(--panel))",
      }}
    >
      <div className="flex items-center gap-3.5">
        <span
          className="inline-flex rounded-[13px] p-3 text-accent"
          style={{ background: "color-mix(in srgb, var(--accent) 22%, transparent)" }}
        >
          <ShoppingBag className="h-[22px] w-[22px]" strokeWidth={2} />
        </span>
        <div>
          <div className="font-display text-[18px] font-bold text-tx">
            Current store rotation
          </div>
          <div className="text-[13px] text-mut">
            {itemCount} {itemCount === 1 ? "item" : "items"} live now · prices set
            by Facepunch
          </div>
        </div>
      </div>

      <div className="text-right">
        {endsAt && initialLabel ? (
          <>
            <RotationCountdown endsAt={endsAt} initialLabel={initialLabel} />
            <div className="text-[12px] text-faint">until rotation ends</div>
          </>
        ) : (
          <div className="flex items-center gap-1.5 text-[13px] text-mut">
            <Clock className="h-4 w-4 text-faint" />
            Rotates regularly
          </div>
        )}
      </div>
    </div>
  );
}
