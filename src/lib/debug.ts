/**
 * Gated debug logger. Only prints when DEBUG env var is set (any truthy value).
 *
 * Use for verbose progress/sync logs that are nice for local debugging but
 * add noise to production. For actual errors that should always surface, keep
 * using console.error.
 *
 *   import { debug } from "@/lib/debug";
 *   debug("[sync]", "Fetched", items.length, "items");
 */
const enabled = Boolean(process.env.DEBUG);

export function debug(...args: unknown[]): void {
  if (enabled) console.log(...args);
}

export function debugWarn(...args: unknown[]): void {
  if (enabled) console.warn(...args);
}
