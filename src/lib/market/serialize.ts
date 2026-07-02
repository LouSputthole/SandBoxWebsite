/**
 * `NextResponse.json` (JSON.stringify) throws on BigInt. MarketOrder.priceUsdc is a BigInt
 * (USDC base units), so serialize it to a decimal string before responding.
 */
export function serializeOrder<T extends { priceUsdc: bigint }>(order: T): Omit<T, "priceUsdc"> & { priceUsdc: string } {
  return { ...order, priceUsdc: order.priceUsdc.toString() };
}
