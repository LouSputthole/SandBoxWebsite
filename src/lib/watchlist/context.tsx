"use client";

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";

interface WatchlistContextType {
  watchlist: string[]; // array of item slugs
  isWatching: (slug: string) => boolean;
  toggle: (slug: string) => void;
  clear: () => void;
}

const WatchlistContext = createContext<WatchlistContextType>({
  watchlist: [],
  isWatching: () => false,
  toggle: () => {},
  clear: () => {},
});

const STORAGE_KEY = "sboxskins-watchlist";

export function WatchlistProvider({ children }: { children: ReactNode }) {
  const [watchlist, setWatchlist] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) setWatchlist(parsed);
      }
    } catch {}
    setLoaded(true);
  }, []);

  // Persist to localStorage
  useEffect(() => {
    if (loaded) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(watchlist));
    }
  }, [watchlist, loaded]);

  const isWatching = useCallback(
    (slug: string) => watchlist.includes(slug),
    [watchlist]
  );

  const toggle = useCallback((slug: string) => {
    setWatchlist((prev) =>
      prev.includes(slug) ? prev.filter((s) => s !== slug) : [...prev, slug]
    );
  }, []);

  const clear = useCallback(() => setWatchlist([]), []);

  return (
    <WatchlistContext.Provider value={{ watchlist, isWatching, toggle, clear }}>
      {children}
    </WatchlistContext.Provider>
  );
}

export function useWatchlist() {
  return useContext(WatchlistContext);
}
