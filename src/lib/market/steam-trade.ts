import type { TradeOffer, TradeStatus } from "./trade-correlation";

/**
 * Edge fetchers for the IEconService trade endpoints — the network I/O for trade-offer correlation.
 * Mirrors steam-inventory.ts's fail-closed contract: any transient/transport failure (non-2xx, an
 * HTML challenge page, unparseable body, or a missing `response` envelope) throws
 * SteamTradeUnavailableError so the oracle cron isolates the tick and skips it. A Steam blip must
 * NEVER turn into an auto-refund or an auto-release.
 *
 * Endpoints (require the SELLER's linked Steam Web API key):
 *   - IEconService/GetTradeOffer/v1  — https://partner.steamgames.com/doc/webapi/IEconService
 *   - IEconService/GetTradeStatus/v1 — https://partner.steamgames.com/doc/webapi/IEconService
 *
 * No custom User-Agent (site convention — blend into generic traffic; the API key authenticates us).
 */

const STEAM_API_BASE = "https://api.steampowered.com/IEconService";

/** Thrown on any non-authoritative trade-API response; callers fail closed (skip the tick). */
export class SteamTradeUnavailableError extends Error {
  constructor(public detail: string) {
    super(`steam trade API unavailable: ${detail}`);
    this.name = "SteamTradeUnavailableError";
  }
}

interface GetTradeOfferResponse {
  response?: { offer?: TradeOffer };
}
interface GetTradeStatusResponse {
  response?: { trades?: TradeStatus[] };
}

/** Fetch + parse, failing closed on anything that isn't a clean JSON envelope. */
async function getJson<T>(url: string, label: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url);
  } catch (err) {
    throw new SteamTradeUnavailableError(`${label} fetch threw: ${(err as Error).message}`);
  }
  // 401/403 = bad/expired key, 429 = rate limited, 5xx = Steam down — all transient/fail-closed.
  if (!res.ok) throw new SteamTradeUnavailableError(`${label} HTTP ${res.status}`);
  const text = await res.text();
  // Steam sometimes serves an HTML error/challenge page with a 200 — never read that as truth.
  if (text.trimStart().startsWith("<")) {
    throw new SteamTradeUnavailableError(`${label} returned HTML, not JSON`);
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new SteamTradeUnavailableError(`${label} returned unparseable JSON`);
  }
}

/**
 * IEconService/GetTradeOffer/v1 — the seller's outgoing offer for `tradeOfferId`.
 * Returns the offer, or `null` when Steam returns a valid envelope with no such offer (a definitive
 * "not found" — lets the oracle SLA-refund rather than spin). THROWS SteamTradeUnavailableError on
 * any transient/transport failure.
 */
export async function fetchTradeOffer(apiKey: string, tradeOfferId: string): Promise<TradeOffer | null> {
  const url =
    `${STEAM_API_BASE}/GetTradeOffer/v1/?key=${encodeURIComponent(apiKey)}` +
    `&tradeofferid=${encodeURIComponent(tradeOfferId)}&language=english`;
  const data = await getJson<GetTradeOfferResponse>(url, "GetTradeOffer");
  if (!data.response) throw new SteamTradeUnavailableError("GetTradeOffer missing response envelope");
  return data.response.offer ?? null;
}

/**
 * IEconService/GetTradeStatus/v1 — the trade(s) for `tradeId`. Returns the `trades` array (possibly
 * empty). THROWS SteamTradeUnavailableError on any transient/transport failure. `get_descriptions`
 * is off — correlation matches by id/class/instance, not display names.
 */
export async function fetchTradeStatus(apiKey: string, tradeId: string): Promise<TradeStatus[]> {
  const url =
    `${STEAM_API_BASE}/GetTradeStatus/v1/?key=${encodeURIComponent(apiKey)}` +
    `&tradeid=${encodeURIComponent(tradeId)}&get_descriptions=false`;
  const data = await getJson<GetTradeStatusResponse>(url, "GetTradeStatus");
  if (!data.response) throw new SteamTradeUnavailableError("GetTradeStatus missing response envelope");
  return data.response.trades ?? [];
}
