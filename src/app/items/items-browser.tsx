"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { ItemGrid } from "@/components/items/item-grid";
import { FilterChips } from "./_components/filter-chips";
import { SortChips } from "./_components/sort-chips";
import { SortMenu } from "./_components/sort-menu";
import { ViewToggle, type ItemsView } from "./_components/view-toggle";
import { PriceRangeFilter } from "./_components/price-range-filter";
import { Pagination } from "./_components/pagination";
import { ItemTable } from "./_components/item-table";

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
  totalSupply: number | null;
  isLimited: boolean;
  rarityColor?: string | null;
}

interface FilterState {
  type: string;
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
  /** "grid" (Arcade card grid) or "table" (dense sortable rows). */
  view: ItemsView;
  filters: FilterState;
  /** Catalog-wide count per singular Item.type. */
  typeCounts: Record<string, number>;
  /** Catalog-wide total item count (the "of N" in the header). */
  catalogTotal: number;
}

// Per-view page sizes. Must match the limits the Server Component uses for the
// first paint (page.tsx) so totalPages agrees. Grid fills the ~5-col Arcade
// grid (4 rows); the dense table shows more rows per page.
const GRID_PAGE_SIZE = 20;
const TABLE_PAGE_SIZE = 50;

const DEFAULT_SORT = "name-asc";

/**
 * Interactive Arcade items browser. The Server Component parent fetches the
 * FIRST render's data + the catalog-wide type counts and passes them in via
 * initialState, so search engines + the first paint always have real items.
 * Subsequent search/filter/sort/view/page changes fetch from /api/items
 * client-side to avoid full-page navigations. View + page are persisted in the
 * URL (?view=, ?page=) so any paged/table view is shareable + deep-linkable.
 */
export function ItemsBrowser({ initialState }: { initialState: InitialState }) {
  const router = useRouter();

  const [items, setItems] = useState(initialState.items);
  const [total, setTotal] = useState(initialState.total);
  const [totalPages, setTotalPages] = useState(initialState.totalPages);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState(initialState.search);
  const [page, setPage] = useState(initialState.page);
  const [view, setView] = useState<ItemsView>(initialState.view);
  const [filters, setFilters] = useState<FilterState>(initialState.filters);

  // Force the card grid on phones — the dense 8-col table is unusable at that
  // width, and a shared ?view=table link shouldn't drop a mobile user into it.
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 768px)");
    setIsMobile(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);
  const effectiveView = isMobile ? "grid" : view;

  // Skip the very first fetch (we already have initialState.items from SSR).
  const firstRenderRef = useRef(true);

  const pageSize = effectiveView === "table" ? TABLE_PAGE_SIZE : GRID_PAGE_SIZE;

  const fetchItems = useCallback(async () => {
    setLoading(true);

    const params = new URLSearchParams();
    if (search) params.set("q", search);
    if (filters.type) params.set("type", filters.type);
    if (filters.minPrice) params.set("minPrice", filters.minPrice);
    if (filters.maxPrice) params.set("maxPrice", filters.maxPrice);
    params.set("sort", filters.sort);
    params.set("page", page.toString());
    params.set("limit", pageSize.toString());

    try {
      const res = await fetch(`/api/items?${params.toString()}`);
      const data = await res.json();
      setItems(data.items);
      setTotal(data.total);
      setTotalPages(data.totalPages);
    } catch (e) {
      console.error("Failed to fetch items:", e);
    } finally {
      setLoading(false);
    }
  }, [search, filters, page, pageSize]);

  // Re-fetch when state changes — but skip the very first render.
  useEffect(() => {
    if (firstRenderRef.current) {
      firstRenderRef.current = false;
      return;
    }
    fetchItems();
  }, [fetchItems]);

  // Sync URL with state so reloads/back/share preserve everything, including
  // numbered ?page= and ?view= (default view = grid, default sort omitted).
  useEffect(() => {
    const params = new URLSearchParams();
    if (search) params.set("q", search);
    if (filters.type) params.set("type", filters.type);
    if (filters.minPrice) params.set("minPrice", filters.minPrice);
    if (filters.maxPrice) params.set("maxPrice", filters.maxPrice);
    if (filters.sort !== DEFAULT_SORT) params.set("sort", filters.sort);
    if (page > 1) params.set("page", page.toString());
    if (view !== "grid") params.set("view", view);

    const qs = params.toString();
    router.replace(`/items${qs ? `?${qs}` : ""}`, { scroll: false });
  }, [search, filters, page, view, router]);

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

  const handlePriceApply = (minPrice: string, maxPrice: string) => {
    setFilters((f) => ({ ...f, minPrice, maxPrice }));
    setPage(1);
  };

  const handleViewChange = (next: ItemsView) => {
    if (next === view) return;
    setView(next);
    // Page sizes differ per view, so restart paging on a view switch.
    setPage(1);
  };

  const handleClearFilters = () => {
    setSearch("");
    setFilters({ type: "", minPrice: "", maxPrice: "", sort: DEFAULT_SORT });
    setPage(1);
  };

  const hasActiveFilters =
    !!search ||
    !!filters.type ||
    !!filters.minPrice ||
    !!filters.maxPrice ||
    filters.sort !== DEFAULT_SORT;

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

      {/* Toolbar row 1: type filters (left) · view toggle (right) */}
      <div className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <FilterChips
          value={filters.type}
          counts={initialState.typeCounts}
          total={initialState.catalogTotal}
          onChange={handleTypeChange}
        />
        {/* Toggle is desktop-only; phones are forced to the grid (effectiveView). */}
        <div className="hidden md:flex">
          <ViewToggle value={view} onChange={handleViewChange} />
        </div>
      </div>

      {/* Toolbar row 2: price range (left) · sort chips + full dropdown (right) */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <PriceRangeFilter
          minPrice={filters.minPrice}
          maxPrice={filters.maxPrice}
          onApply={handlePriceApply}
          onClear={handleClearFilters}
          showClear={hasActiveFilters}
        />
        <div className="flex flex-wrap items-center gap-2">
          <SortChips value={filters.sort} onChange={handleSortChange} />
          <SortMenu value={filters.sort} onChange={handleSortChange} />
        </div>
      </div>

      {/* Content */}
      {loading ? (
        effectiveView === "table" ? (
          <SkeletonTable />
        ) : (
          <SkeletonGrid />
        )
      ) : effectiveView === "table" ? (
        <ItemTable
          items={items}
          rankOffset={(page - 1) * pageSize}
          sort={filters.sort}
          onSortChange={handleSortChange}
        />
      ) : (
        <ItemGrid items={items} />
      )}

      {/* Numbered pagination (shared by both views) */}
      {!loading && (
        <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
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

function SkeletonTable() {
  return (
    <div className="overflow-hidden rounded-[14px] border border-[var(--line)] bg-[var(--panel)]">
      <div className="border-b border-[var(--line)] px-3 py-3">
        <div className="h-3 w-40 animate-pulse rounded bg-[var(--bg2)]" />
      </div>
      {Array.from({ length: 12 }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-3 border-b border-[var(--line2)] px-3 py-2.5 last:border-0"
        >
          <div className="h-3 w-5 animate-pulse rounded bg-[var(--bg2)]" />
          <div className="h-9 w-9 animate-pulse rounded-[10px] bg-[var(--bg2)]" />
          <div className="h-4 w-40 animate-pulse rounded bg-[var(--bg2)]" />
          <div className="ml-auto flex gap-6">
            <div className="h-4 w-14 animate-pulse rounded bg-[var(--bg2)]" />
            <div className="h-4 w-14 animate-pulse rounded bg-[var(--bg2)]" />
            <div className="h-4 w-14 animate-pulse rounded bg-[var(--bg2)]" />
          </div>
        </div>
      ))}
    </div>
  );
}
