import { cn } from "@/lib/utils";
import { GradientAvatar } from "./gradient-avatar";

/**
 * Wallet avatar for the Whales table. Renders the whale's REAL Steam avatar
 * when we have one, and falls back to the deterministic gradient-initials
 * avatar otherwise. We use a plain <img> (not next/image) so we don't have to
 * allowlist Steam's avatar CDN in next.config — same approach the pre-redesign
 * page used. A falsy `avatarUrl` is never passed to src; we render the
 * gradient instead so the image element never gets an empty source.
 */
export interface WhaleAvatarProps {
  /** Real Steam avatar URL from the topHolders blob (may be empty/missing). */
  avatarUrl?: string | null;
  /** Stable seed for the gradient fallback (the wallet's steamId). */
  steamId: string;
  /** Display name the gradient initials are derived from. */
  name: string;
  className?: string;
}

export function WhaleAvatar({
  avatarUrl,
  steamId,
  name,
  className,
}: WhaleAvatarProps) {
  if (avatarUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={avatarUrl}
        alt=""
        className={cn(
          "h-[42px] w-[42px] flex-shrink-0 rounded-[12px] border border-line object-cover",
          className
        )}
      />
    );
  }
  return <GradientAvatar seed={steamId} name={name} className={className} />;
}
