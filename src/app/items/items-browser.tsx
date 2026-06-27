"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ItemGrid } from "@/components/items/item-grid";
import { FilterChips } from "./_components/filter-chips";
import { SortChips } from "./_components/sort-chips";

interface Item {
  id: string;
  name: string;
  slug: string;
  type: string;
  imageUrl: string | null;
  currentPrice: number | null;
  lowestPrice: number | null;
  medianPrice: number | null;
  priceChange24h: number | null;
  volume: number | null;
  isLimited: boolean;
  rarityColor?: string | null;
}

interface FilterState {
  type: string;
  // minPrice/maxPrice have no Arcade UI control, but flow through from URL
  // params so deep links (?minPrice=…) still filter the initial render.
  minPrice: string;
  maxPrice: string;
  sort: string;
}

interface InitialState {
  items: Item[];
  total: number;
  totalPages: number;
  page: number;
  search: string;
  filters: FilterState;
  /** Catalog-wide count per singular Item.type. */
  typeCounts: Record<string, number>;
  /** Catalog-wide total item count (the "of N" in the header). */
  catalogTotal: number;
}

// Grid page size — fills the ~5-column Arcade grid (4 rows). Must match the
// `limit` the Server Component uses for the first paint so totalPages agrees.
const PAGE_SIZE = 20;

/**
 * Interactive Arcade items browser. The Server Component parent fetches the
 * FIRST render's data + the catalog-wide type counts and passes them in via
 * initialState, so search engines + the first paint always have real items.
 * Subsequent filter/sort/search/load-more changes fetch from /api/items
 * client-side to avoid full-page navigations.
 */
export function ItemsBrowser({ initialState }: { initialState: InitialState }) {
  const router = useRouter();

  const [items, setItems] = useState(initialState.items);
  const [total, setTotal] = useState(initialState.total);
  const [totalPages, setTotalPages] = useState(initialState.totalPages);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [search, setSearch] = useState(initialState.search);
  const [page, setPage] = useState(initialState.page);
  const [filters, setFilters] = useState<FilterState>(initialState.filters);

  // Skip the very first fetch (we already have initialState.items from SSR).
  const firstRenderRef = useRef(true);
  // When true, the next fetch APPENDS (Load more) instead of replacing.
  const appendRef = useRef(false);

  const fetchItems = useCallback(async () => {
    const append = appendRef.current;
    if (append) setLoadingMore(true);
    else setLoading(true);

    const params = new URLSearchParams();
    if (search) params.set("q", search);
    if (filters.type) params.set("type", filters.type);
    if (filters.minPrice) params.set("minPrice", filters.minPrice);
    if (filters.maxPrice) params.set("maxPrice", filters.maxPrice);
    params.set("sort", filters.sort);
    params.set("page", page.toString());
    params.set("limit", PAGE_SIZE.toString());

    try {
      const res = await fetch(`/api/items?${params.toString()}`);
      const data = await res.json();
      setItems((prev) => (append ? [...prev, ...data.items] : data.items));
      setTotal(data.total);
      setTotalPages(data.totalPages);
    } catch (e) {
      console.error("Failed to fetch items:", e);
    } finally {
      appendRef.current = false;
      setLoading(false);
      setLoadingMore(false);
    }
  }, [search, filters, page]);

  // Re-fetch when state changes — but skip the very first render.
  useEffect(() => {
    if (firstRenderRef.current) {
      firstRenderRef.current = false;
      return;
    }
    fetchItems();
  }, [fetchItems]);

  // Sync URL with state so reloads/back/share preserve filters. `page` is left
  // out on purpose: "Load more" accumulates pages client-side, so a `?page=N`
  // on reload (which would fetch only page N) would be misleading.
  useEffect(() => {
    const params = new URLSearchParams();
    if (search) params.set("q", search);
    if (filters.type) params.set("type", filters.type);
    if (filters.minPrice) params.set("minPrice", filters.minPrice);
    if (filters.maxPrice) params.set("maxPrice", filters.maxPrice);
    if (filters.sort !== "name-asc") params.set("sort", filters.sort);

    const qs = params.toString();
    router.replace(`/items${qs ? `?${qs}` : ""}`, { scroll: false });
  }, [search, filters, router]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
  };

  const handleTypeChange = (type: string) => {
    setFilters((f) => ({ ...f, type }));
    setPage(1);
  };

  const handleSortChange = (sort: string) => {
    setFilters((f) => ({ ...f, sort }));
    setPage(1);
  };

  const handleLoadMore = () => {
    appendRef.current = true;
    setPage((p) => p + 1);
  };

  return (
    <div className="mx-auto max-w-[1240px] px-6 py-8">
      {/* Header */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-3xl font-extrabold tracking-tight text-[var(--tx)] sm:text-[38px]">
            All S&box skins
          </h1>
          <p className="mt-2 text-sm text-[var(--mut)]">
            Every tracked cosmetic on the Steam Community Market. Showing{" "}
            <span className="font-mono font-semibold text-[var(--tx)]">
              {total.toLocaleString()}
            </span>{" "}
            of{" "}
            <span className="font-mono font-semibold text-[var(--tx)]">
              {initialState.catalogTotal.toLocaleString()}
            </span>
            .
          </p>
        </div>

        <form onSubmit={handleSearch} className="relative w-full sm:w-[280px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--faint)]" />
          <Input
            placeholder="Search skins…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="h-10 rounded-xl border-[var(--line)] bg-[var(--panel)] pl-9 text-[var(--tx)] placeholder:text-[var(--faint)] focus-visible:border-[var(--accent)] focus-visible:ring-0"
          />
        </form>
      </div>

      {/* Toolbar: type filters (left) · sort (right) */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <FilterChips
          value={filters.type}
          counts={initialState.typeCounts}
          total={initialState.catalogTotal}
          onChange={handleTypeChange}
        />
        <SortChips value={filters.sort} onChange={handleSortChange} />
      </div>

      {/* Grid */}
      {loading ? <SkeletonGrid /> : <ItemGrid items={items} />}

      {/* Load more */}
      {!loading && page < totalPages && (
        <div className="flex justify-center pt-9 pb-2">
          <Button
            variant="secondary"
            size="lg"
            onClick={handleLoadMore}
            disabled={loadingMore}
          >
            {loadingMore ? "Loading…" : "Load more skins"}
          </Button>
        </div>
      )}
    </div>
  );
}

function SkeletonGrid() {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
      {Array.from({ length: 10 }).map((_, i) => (
        <div
          key={i}
          className="rounded-[18px] border border-[var(--line)] bg-[var(--panel)] p-3"
        >
          <div className="mb-3 aspect-square w-full animate-pulse rounded-[14px] bg-[var(--bg2)]" />
          <div className="mb-2 h-4 w-3/4 animate-pulse rounded bg-[var(--bg2)]" />
          <div className="mb-3 h-3 w-1/2 animate-pulse rounded bg-[var(--bg2)]" />
          <div className="h-5 w-1/3 animate-pulse rounded bg-[var(--bg2)]" />
        </div>
      ))}
    </div>
  );
}
