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

const rarityGradients: Record<string, string> = {
  common: "from-neutral-700 to-neutral-800",
  uncommon: "from-emerald-900/60 to-emerald-950/80",
  rare: "from-blue-900/60 to-blue-950/80",
  legendary: "from-purple-900/60 to-purple-950/80",
};

const rarityIconColors: Record<string, string> = {
  common: "text-neutral-500",
  uncommon: "text-emerald-500/60",
  rare: "text-blue-500/60",
  legendary: "text-purple-500/60",
};

interface ItemImageProps {
  src: string | null;
  name: string;
  type: string;
  rarity: string | null;
  size?: "sm" | "lg";
  className?: string;
}

export function ItemImage({ src, name, type, rarity, size = "sm", className = "" }: ItemImageProps) {
  const [failed, setFailed] = useState(false);
  const r = rarity ?? "common";
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
          className="object-contain"
          onError={() => setFailed(true)}
        />
      </div>
    );
  }

  // Placeholder with type icon and rarity gradient
  return (
    <div className={`relative flex items-center justify-center bg-gradient-to-br ${rarityGradients[r] || rarityGradients.common} ${className}`}>
      <Icon className={`${iconSize} ${rarityIconColors[r] || rarityIconColors.common}`} />
      {size === "lg" && (
        <span className="absolute bottom-3 left-0 right-0 text-center text-xs font-medium text-neutral-500 truncate px-4">
          {name}
        </span>
      )}
    </div>
  );
}
