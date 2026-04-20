"use client";

import { useCurrency, formatInCurrency } from "@/lib/fx/context";

/**
 * Client-only price renderer. Converts the USD value stored in our DB
 * into whatever currency the user picked (persisted in localStorage).
 *
 * First render (SSR + pre-hydration client) always shows USD so the
 * hydration markup matches. After useEffect fires, the provider has
 * the user's chosen currency + FX rates and every <Price> re-renders
 * in the target currency. The flash is unavoidable without server-
 * side cookie reads; acceptable tradeoff to keep SEO renders in USD.
 *
 * Prefer this over formatPrice() anywhere a user-visible price is
 * rendered in a client component. formatPrice() is still used in
 * server-only contexts (tweets, exports, blog content) which stay USD.
 */
export function Price({
  amount,
  className,
}: {
  amount: number | null | undefined;
  className?: string;
}) {
  const { currency, rates } = useCurrency();

  if (amount == null) {
    return <span className={className}>—</span>;
  }

  return <span className={className}>{formatInCurrency(amount, currency, rates)}</span>;
}
