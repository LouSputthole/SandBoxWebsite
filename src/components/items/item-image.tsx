"use client";

import { useState } from "react";
import Image from "next/image";
import {
  User,
  Shirt,
  Gem,
  Sword,
  Wrench,
  Package,
} from "lucide-react";

const typeIcons: Record<string, typeof User> = {
  character: User,
  clothing: Shirt,
  accessory: Gem,
  weapon: Sword,
  tool: Wrench,
};

interface ItemImageProps {
  src: string | null;
  name: string;
  type: string;
  size?: "sm" | "lg";
  className?: string;
  /** When set, the image-less fallback renders the category glyph stroked in
   *  this color on a transparent background (so a parent skin-tile gradient
   *  shows through). When omitted, a standalone dark gradient fallback is used. */
  rarityColor?: string | null;
  /** Object-fit for the real image. Defaults to "contain" (legacy behavior);
   *  the skin tile passes "cover". */
  fit?: "cover" | "contain";
}

export function ItemImage({
  src,
  name,
  type,
  size = "sm",
  className = "",
  rarityColor,
  fit = "contain",
}: ItemImageProps) {
  const [failed, setFailed] = useState(false);
  const Icon = typeIcons[type] || Package;
  const iconSize = size === "lg" ? "h-16 w-16" : "h-8 w-8";

  // Try real image first (for when Steam data is available)
  if (src && !src.startsWith("/items/") && !failed) {
    return (
      <div className={`relative overflow-hidden ${className}`}>
        <Image
          src={src}
          alt={name}
          fill
          className={fit === "cover" ? "object-cover" : "object-contain"}
          onError={() => setFailed(true)}
        />
      </div>
    );
  }

  // Skin-tile fallback: transparent, glyph stroked in the rarity color so the
  // parent tile's radial gradient shows through.
  if (rarityColor) {
    return (
      <div className={`relative flex items-center justify-center ${className}`}>
        <Icon
          className={iconSize}
          strokeWidth={1.5}
          style={{ color: rarityColor, opacity: 0.8 }}
        />
      </div>
    );
  }

  // Standalone fallback: dark arcade gradient + neutral type icon.
  return (
    <div
      className={`relative flex items-center justify-center bg-gradient-to-br from-[var(--panel)] to-[var(--panel2)] ${className}`}
    >
      <Icon className={`${iconSize} text-[var(--faint)]`} />
      {size === "lg" && (
        <span className="absolute bottom-3 left-0 right-0 truncate px-4 text-center text-xs font-medium text-[var(--faint)]">
          {name}
        </span>
      )}
    </div>
  );
}
