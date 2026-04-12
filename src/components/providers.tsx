"use client";

import type { ReactNode } from "react";
import { AuthProvider } from "@/lib/auth/context";
import { WatchlistProvider } from "@/lib/watchlist/context";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <WatchlistProvider>{children}</WatchlistProvider>
    </AuthProvider>
  );
}
