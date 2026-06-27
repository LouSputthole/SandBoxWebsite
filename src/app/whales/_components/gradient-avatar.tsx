import { cn } from "@/lib/utils";

/**
 * Wallet avatar for the Whales table: a rounded square filled with a
 * 2-color linear gradient deterministically derived from the wallet's
 * seed (steamId), with the wallet's initials centered in display type.
 * Mirrors the Arcade mockup's gradient-avatar pattern (no Steam image).
 */

// Gradient palette from the Whales reference (Whales.dc.html `pal`).
const AVATAR_GRADIENTS = [
  "linear-gradient(140deg,#A855F7,#C77DFF)",
  "linear-gradient(140deg,#5AA9FF,#22D3EE)",
  "linear-gradient(140deg,#F472B6,#FB7185)",
  "linear-gradient(140deg,#37E08B,#22D3EE)",
  "linear-gradient(140deg,#FBBF24,#FB923C)",
  "linear-gradient(140deg,#C77DFF,#A855F7)",
] as const;

/** First letters of the first two name tokens (split on _ / whitespace). */
function deriveInitials(name: string): string {
  const tokens = name.split(/[_\s]+/).filter(Boolean);
  const first = tokens[0]?.[0] ?? "";
  const second = tokens[1]?.[0] ?? tokens[0]?.[1] ?? "";
  const out = (first + second).toUpperCase();
  return out || "?";
}

/** Stable, position-independent palette index from a seed string. */
function gradientForSeed(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return AVATAR_GRADIENTS[h % AVATAR_GRADIENTS.length];
}

export interface GradientAvatarProps {
  /** Stable seed used to pick the gradient (e.g. the wallet's steamId). */
  seed: string;
  /** Display name the initials are derived from. */
  name: string;
  className?: string;
}

export function GradientAvatar({ seed, name, className }: GradientAvatarProps) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex h-[42px] w-[42px] flex-shrink-0 items-center justify-center rounded-[12px] font-display text-[15px] font-extrabold text-white",
        className
      )}
      style={{ background: gradientForSeed(seed) }}
    >
      {deriveInitials(name)}
    </span>
  );
}
