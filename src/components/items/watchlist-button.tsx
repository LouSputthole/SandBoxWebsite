"use client";

import { Heart } from "lucide-react";
import { useWatchlist } from "@/lib/watchlist/context";
import { cn } from "@/lib/utils";

interface WatchlistButtonProps {
  slug: string;
  size?: "sm" | "md";
  className?: string;
}

export function WatchlistButton({ slug, size = "sm", className }: WatchlistButtonProps) {
  const { isWatching, toggle } = useWatchlist();
  const active = isWatching(slug);

  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        toggle(slug);
      }}
      title={active ? "Remove from watchlist" : "Add to watchlist"}
      className={cn(
        "transition-colors",
        active
          ? "text-pink-400 hover:text-pink-300"
          : "text-neutral-600 hover:text-pink-400",
        className,
      )}
    >
      <Heart
        className={cn(
          size === "sm" ? "h-4 w-4" : "h-5 w-5",
          active && "fill-pink-400",
        )}
      />
    </button>
  );
}
