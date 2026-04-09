// Types for our internal data model
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

// ---- Steam Community Market API response types ----

/** Response from /market/search/render/?norender=1&appid=590830 */
export interface SteamSearchResponse {
  success: boolean;
  start: number;
  pagesize: number;
  total_count: number;
  results: SteamSearchResult[];
}

export interface SteamSearchResult {
  name: string;
  hash_name: string;
  sell_listings: number;
  sell_price: number;
  sell_price_text: string;
  app_icon: string;
  app_name: string;
  asset_description: {
    appid: number;
    classid: string;
    instanceid: string;
    background_color: string;
    icon_url: string;
    tradable: number;
    name: string;
    name_color: string;
    type: string;
    market_name: string;
    market_hash_name: string;
    commodity: number;
  };
  sale_price_text: string;
}

/** Response from /market/priceoverview/?appid=590830 */
export interface SteamPriceOverview {
  success: boolean;
  lowest_price?: string;
  median_price?: string;
  volume?: string;
}

/** Result of our sync operation */
export interface SyncResult {
  success: boolean;
  itemsProcessed: number;
  itemsCreated: number;
  itemsUpdated: number;
  pricePointsCreated: number;
  errors: string[];
  duration: number;
}

// ---- Steam Inventory API response types ----

export interface SteamInventoryResponse {
  assets?: SteamInventoryAsset[];
  descriptions?: SteamInventoryDescription[];
  total_inventory_count: number;
  success: number;
  more_items?: number;
  last_assetid?: string;
}

export interface SteamInventoryAsset {
  appid: number;
  contextid: string;
  assetid: string;
  classid: string;
  instanceid: string;
  amount: string;
}

export interface SteamInventoryDescription {
  appid: number;
  classid: string;
  instanceid: string;
  name: string;
  market_hash_name: string;
  market_name: string;
  type: string;
  icon_url: string;
  tradable: number;
  marketable: number;
  tags?: { category: string; internal_name: string; localized_tag_name: string }[];
}

export interface SteamVanityResponse {
  response: {
    steamid?: string;
    success: number;
    message?: string;
  };
}

// ---- Steam Market Order Histogram types ----

export interface SteamOrderHistogram {
  success: number;
  sell_order_count: string;
  sell_order_price: string;
  sell_order_table: string;
  buy_order_count: string;
  buy_order_price: string;
  buy_order_table: string;
  highest_buy_order: string; // price in cents
  lowest_sell_order: string; // price in cents
  buy_order_graph: [number, number, string][]; // [price, cumulative_qty, description]
  sell_order_graph: [number, number, string][]; // [price, cumulative_qty, description]
  graph_max_y: number;
  graph_min_x: number;
  graph_max_x: number;
  price_prefix: string;
  price_suffix: string;
}
