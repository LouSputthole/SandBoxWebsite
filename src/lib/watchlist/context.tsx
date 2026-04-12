"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  type ReactNode,
} from "react";
import { useAuth } from "@/lib/auth/context";

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
  const { user, loading: authLoading } = useAuth();
  const [watchlist, setWatchlist] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);
  const mergedRef = useRef(false);

  // Load watchlist — from server if logged in, localStorage otherwise
  useEffect(() => {
    if (authLoading) return;

    if (user) {
      fetch("/api/watchlist")
        .then((res) => res.json())
        .then((data) => {
          if (Array.isArray(data.slugs)) {
            setWatchlist(data.slugs);
          }
        })
        .catch(() => {})
        .finally(() => setLoaded(true));
    } else {
      try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
          const parsed = JSON.parse(stored);
          if (Array.isArray(parsed)) setWatchlist(parsed);
        }
      } catch {}
      setLoaded(true);
    }
  }, [user, authLoading]);

  // On login, merge localStorage watchlist into server then clear it
  useEffect(() => {
    if (!user || !loaded || mergedRef.current) return;
    mergedRef.current = true;

    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const localSlugs = JSON.parse(stored);
        if (Array.isArray(localSlugs) && localSlugs.length > 0) {
          fetch("/api/watchlist", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ slugs: localSlugs }),
          })
            .then((res) => res.json())
            .then((data) => {
              if (Array.isArray(data.slugs)) {
                setWatchlist(data.slugs);
              }
              localStorage.removeItem(STORAGE_KEY);
            })
            .catch(() => {});
        }
      }
    } catch {}
  }, [user, loaded]);

  // Persist to localStorage only when not logged in
  useEffect(() => {
    if (loaded && !user) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(watchlist));
    }
  }, [watchlist, loaded, user]);

  const isWatching = useCallback(
    (slug: string) => watchlist.includes(slug),
    [watchlist],
  );

  const toggle = useCallback(
    (slug: string) => {
      const removing = watchlist.includes(slug);

      // Optimistic update
      setWatchlist((prev) =>
        prev.includes(slug)
          ? prev.filter((s) => s !== slug)
          : [...prev, slug],
      );

      // Sync with server if logged in
      if (user) {
        if (removing) {
          fetch("/api/watchlist", {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ slug }),
          }).catch(() => {
            setWatchlist((prev) => [...prev, slug]);
          });
        } else {
          fetch("/api/watchlist", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ slug }),
          }).catch(() => {
            setWatchlist((prev) => prev.filter((s) => s !== slug));
          });
        }
      }
    },
    [watchlist, user],
  );

  const clear = useCallback(() => {
    setWatchlist([]);
    if (user) {
      fetch("/api/watchlist")
        .then((res) => res.json())
        .then((data) => {
          if (Array.isArray(data.slugs)) {
            Promise.all(
              data.slugs.map((slug: string) =>
                fetch("/api/watchlist", {
                  method: "DELETE",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ slug }),
                }),
              ),
            );
          }
        })
        .catch(() => {});
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, [user]);

  return (
    <WatchlistContext.Provider value={{ watchlist, isWatching, toggle, clear }}>
      {children}
    </WatchlistContext.Provider>
  );
}

export function useWatchlist() {
  return useContext(WatchlistContext);
}
