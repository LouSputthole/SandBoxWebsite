import type { ReactNode } from "react";
import { ItemImage } from "@/components/items/item-image";

interface SkinTileProps {
  imageUrl: string | null;
  name: string;
  type: string;
  /** Resolved CSS color (e.g. from rarityCssColor). Tints the radial gradient
   *  and strokes the fallback category glyph. Falls back to a neutral tint. */
  rarityColor?: string | null;
  /** Optional pre-styled corner badge (rarity label, % delta, "x left", …). */
  badge?: ReactNode;
  /** Glyph size for the image-less fallback. */
  iconSize?: "sm" | "lg";
  /** Extra classes for sizing/shape (defaults to a square tile). */
  className?: string;
}

/**
 * The shared "skin tile" frame used everywhere a skin renders: a rounded
 * square with a rarity-tinted radial gradient, a 1px hairline border, and a
 * centered category line-icon as the placeholder. Real Steam art drops into
 * the same frame (object-cover) via <ItemImage>. Reuse this so every surface
 * (cards, lists, hero, detail) shares one consistent frame.
 */
export function SkinTile({
  imageUrl,
  name,
  type,
  rarityColor,
  badge,
  iconSize = "sm",
  className = "",
}: SkinTileProps) {
  const tint = rarityColor || "#5a5468";

  return (
    <div
      className={`relative aspect-square overflow-hidden rounded-[14px] border border-[var(--line)] ${className}`}
      style={{
        background: `radial-gradient(120% 100% at 50% 0%, color-mix(in srgb, ${tint} 24%, transparent), var(--panel2) 62%)`,
      }}
    >
      <ItemImage
        src={imageUrl}
        name={name}
        type={type}
        rarityColor={tint}
        fit="cover"
        size={iconSize}
        className="h-full w-full"
      />
      {badge && <div className="absolute right-2 top-2 z-10">{badge}</div>}
    </div>
  );
}
