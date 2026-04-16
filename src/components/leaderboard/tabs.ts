import type { LucideIcon } from "lucide-react";
import { Crown, TrendingUp, TrendingDown, BarChart3 } from "lucide-react";

export type LeaderboardTab = "expensive" | "gainers" | "losers" | "popular";

export const tabs: { key: LeaderboardTab; label: string; icon: LucideIcon }[] = [
  { key: "expensive", label: "Most Valuable", icon: Crown },
  { key: "gainers", label: "Top Gainers", icon: TrendingUp },
  { key: "losers", label: "Top Losers", icon: TrendingDown },
  { key: "popular", label: "Most Listed", icon: BarChart3 },
];
