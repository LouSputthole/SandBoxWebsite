export interface SteamMarketItem {
  name: string;
  slug: string;
  description: string;
  type: ItemType;
  rarity: ItemRarity;
  imageUrl: string;
  marketUrl: string;
  currentPrice: number;
  lowestPrice: number;
  medianPrice: number;
  volume: number;
  priceChange24h: number;
  isLimited: boolean;
}

export type ItemType = "character" | "clothing" | "accessory" | "weapon" | "tool";
export type ItemRarity = "common" | "uncommon" | "rare" | "legendary";

export interface PriceHistoryPoint {
  price: number;
  volume: number;
  timestamp: Date;
}

export interface ItemsQueryParams {
  q?: string;
  type?: string;
  rarity?: string;
  minPrice?: string;
  maxPrice?: string;
  sort?: string;
  page?: string;
  limit?: string;
}
