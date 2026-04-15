"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { Search, LayoutGrid, List } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ItemGrid } from "@/components/items/item-grid";
import { ItemTable } from "@/components/items/item-table";
import { ItemFilters } from "@/components/items/item-filters";
import { Skeleton } from "@/components/ui/skeleton";

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
  view: "grid" | "table";
  filters: FilterState;
}

const defaultFilters: FilterState = {
  type: "",
  minPrice: "",
  maxPrice: "",
  sort: "name-asc",
};

/**
 * Interactive items browser. The Server Component parent fetches the FIRST
 * render's data and passes it in via initialState, so search engines + the
 * first paint always have real items. Subsequent filter/page/sort changes
 * fetch from /api/items client-side to avoid full-page navigations.
 */
export function ItemsBrowser({ initialState }: { initialState: InitialState }) {
  const router = useRouter();

  const [items, setItems] = useState(initialState.items);
  const [total, setTotal] = useState(initialState.total);
  const [totalPages, setTotalPages] = useState(initialState.totalPages);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState(initialState.search);
  const [page, setPage] = useState(initialState.page);
  const [view, setView] = useState<"grid" | "table">(initialState.view);
  const [isMobile, setIsMobile] = useState(false);
  const [filters, setFilters] = useState<FilterState>(initialState.filters);

  // Track the very first render so we don't re-fetch identical initial data
  const firstRenderRef = useRef(true);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 768px)");
    setIsMobile(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  const effectiveView = isMobile ? "grid" : view;
  const limit = effectiveView === "table" ? 25 : 12;

  const fetchItems = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (search) params.set("q", search);
    if (filters.type) params.set("type", filters.type);
    if (filters.minPrice) params.set("minPrice", filters.minPrice);
    if (filters.maxPrice) params.set("maxPrice", filters.maxPrice);
    params.set("sort", filters.sort);
    params.set("page", page.toString());
    params.set("limit", limit.toString());

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
  }, [search, filters, page, limit]);

  // Re-fetch when state changes — but skip the very first render (we already
  // have initialState.items from the server)
  useEffect(() => {
    if (firstRenderRef.current) {
      firstRenderRef.current = false;
      return;
    }
    fetchItems();
  }, [fetchItems]);

  // Sync URL with state so reloads/back/share preserve everything
  useEffect(() => {
    const params = new URLSearchParams();
    if (search) params.set("q", search);
    if (filters.type) params.set("type", filters.type);
    if (filters.minPrice) params.set("minPrice", filters.minPrice);
    if (filters.maxPrice) params.set("maxPrice", filters.maxPrice);
    if (filters.sort !== "name-asc") params.set("sort", filters.sort);
    if (page > 1) params.set("page", page.toString());
    if (view !== "table") params.set("view", effectiveView);

    const qs = params.toString();
    router.replace(`/items${qs ? `?${qs}` : ""}`, { scroll: false });
  }, [search, filters, page, view, effectiveView, router]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
  };

  const handleSortChange = (newSort: string) => {
    setFilters((f) => ({ ...f, sort: newSort }));
    setPage(1);
  };

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">Browse Skins</h1>
          <p className="text-sm text-neutral-500 mt-1">
            Explore all S&box skins available on the Steam Community Market
          </p>
        </div>
        <div className="hidden md:flex items-center gap-1 bg-neutral-900 rounded-lg border border-neutral-800 p-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => { setView("table"); setPage(1); }}
            className={`px-2 ${effectiveView === "table" ? "bg-neutral-800 text-white" : "text-neutral-500"}`}
          >
            <List className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => { setView("grid"); setPage(1); }}
            className={`px-2 ${effectiveView === "grid" ? "bg-neutral-800 text-white" : "text-neutral-500"}`}
          >
            <LayoutGrid className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-8">
        <aside className="w-full lg:w-56 shrink-0">
          <form onSubmit={handleSearch} className="mb-6">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-500" />
              <Input
                placeholder="Search skins..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                className="pl-9"
              />
            </div>
          </form>

          <ItemFilters
            filters={filters}
            onFilterChange={(f) => {
              setFilters(f);
              setPage(1);
            }}
            onReset={() => {
              setFilters(defaultFilters);
              setPage(1);
            }}
          />
        </aside>

        <div className="flex-1 min-w-0">
          {loading ? (
            <SkeletonView view={effectiveView} />
          ) : effectiveView === "table" ? (
            <ItemTable
              items={items}
              page={page}
              totalPages={totalPages}
              total={total}
              sort={filters.sort}
              onPageChange={setPage}
              onSortChange={handleSortChange}
            />
          ) : (
            <ItemGrid
              items={items}
              page={page}
              totalPages={totalPages}
              total={total}
              onPageChange={setPage}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function SkeletonView({ view }: { view: "grid" | "table" }) {
  if (view === "table") {
    return (
      <div>
        <Skeleton className="h-5 w-32 mb-4" />
        <div className="rounded-xl border border-neutral-800 overflow-hidden">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-4 py-3 border-b border-neutral-800/50">
              <Skeleton className="h-4 w-6" />
              <Skeleton className="h-10 w-10 rounded-lg" />
              <Skeleton className="h-4 w-40" />
              <div className="ml-auto flex gap-8">
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-4 w-16" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }
  return (
    <div>
      <Skeleton className="h-5 w-32 mb-4" />
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        {Array.from({ length: 12 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-neutral-800 p-4">
            <Skeleton className="h-32 w-full mb-4 rounded-lg" />
            <Skeleton className="h-4 w-3/4 mb-2" />
            <Skeleton className="h-3 w-1/2 mb-3" />
            <Skeleton className="h-6 w-1/3" />
          </div>
        ))}
      </div>
    </div>
  );
}
