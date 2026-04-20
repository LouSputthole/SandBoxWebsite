"use client";

import type { ReactNode } from "react";
import { AuthProvider } from "@/lib/auth/context";
import { WatchlistProvider } from "@/lib/watchlist/context";
import { CurrencyProvider } from "@/lib/fx/context";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <WatchlistProvider>
        <CurrencyProvider>{children}</CurrencyProvider>
      </WatchlistProvider>
    </AuthProvider>
  );
}
