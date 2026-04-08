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
}

export function ItemImage({ src, name, type, size = "sm", className = "" }: ItemImageProps) {
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
          className="object-contain"
          onError={() => setFailed(true)}
        />
      </div>
    );
  }

  // Placeholder with type icon
  return (
    <div className={`relative flex items-center justify-center bg-gradient-to-br from-neutral-700 to-neutral-800 ${className}`}>
      <Icon className={`${iconSize} text-neutral-500`} />
      {size === "lg" && (
        <span className="absolute bottom-3 left-0 right-0 text-center text-xs font-medium text-neutral-500 truncate px-4">
          {name}
        </span>
      )}
    </div>
  );
}
