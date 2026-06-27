/**
 * Shared item shape for the Arcade homepage presentational components.
 * Mirrors the columns the homepage queries already return (a full
 * `prisma.item.findMany()` row), so page.tsx can cast straight to it.
 */
export interface HomeItem {
  id: string;
  name: string;
  slug: string;
  type: string;
  imageUrl: string | null;
  currentPrice: number | null;
  priceChange24h: number | null;
  volume: number | null;
  totalSupply: number | null;
  isLimited: boolean;
  /** Steam-sourced rarity tint (hex, no leading #), when graded. */
  rarityColor?: string | null;
}
