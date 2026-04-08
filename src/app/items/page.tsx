"use client";

import { Suspense, useEffect, useState, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
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
  rarity: string | null;
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
  rarity: string;
  minPrice: string;
  maxPrice: string;
  sort: string;
}

const defaultFilters: FilterState = {
  type: "",
  rarity: "",
  minPrice: "",
  maxPrice: "",
  sort: "name-asc",
};

export default function BrowsePage() {
  return (
    <Suspense fallback={<BrowsePageSkeleton />}>
      <BrowsePageContent />
    </Suspense>
  );
}

function BrowsePageSkeleton() {
  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
      <Skeleton className="h-8 w-48 mb-2" />
      <Skeleton className="h-4 w-80 mb-8" />
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        {Array.from({ length: 12 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-neutral-800 p-4">
            <Skeleton className="h-32 w-full mb-4 rounded-lg" />
            <Skeleton className="h-4 w-3/4 mb-2" />
            <Skeleton className="h-6 w-1/3" />
          </div>
        ))}
      </div>
    </div>
  );
}

function BrowsePageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const [items, setItems] = useState<Item[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState(searchParams.get("q") || "");
  const [page, setPage] = useState(parseInt(searchParams.get("page") || "1"));
  const [view, setView] = useState<"grid" | "table">(
    (searchParams.get("view") as "grid" | "table") || "table"
  );
  const [filters, setFilters] = useState<FilterState>({
    type: searchParams.get("type") || "",
    rarity: searchParams.get("rarity") || "",
    minPrice: searchParams.get("minPrice") || "",
    maxPrice: searchParams.get("maxPrice") || "",
    sort: searchParams.get("sort") || "name-asc",
  });

  const limit = view === "table" ? 25 : 12;

  const fetchItems = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (search) params.set("q", search);
    if (filters.type) params.set("type", filters.type);
    if (filters.rarity) params.set("rarity", filters.rarity);
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

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  // Sync URL
  useEffect(() => {
    const params = new URLSearchParams();
    if (search) params.set("q", search);
    if (filters.type) params.set("type", filters.type);
    if (filters.rarity) params.set("rarity", filters.rarity);
    if (filters.minPrice) params.set("minPrice", filters.minPrice);
    if (filters.maxPrice) params.set("maxPrice", filters.maxPrice);
    if (filters.sort !== "name-asc") params.set("sort", filters.sort);
    if (page > 1) params.set("page", page.toString());
    if (view !== "table") params.set("view", view);

    const qs = params.toString();
    router.replace(`/items${qs ? `?${qs}` : ""}`, { scroll: false });
  }, [search, filters, page, view, router]);

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
        {/* View toggle */}
        <div className="flex items-center gap-1 bg-neutral-900 rounded-lg border border-neutral-800 p-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => { setView("table"); setPage(1); }}
            className={`px-2 ${view === "table" ? "bg-neutral-800 text-white" : "text-neutral-500"}`}
          >
            <List className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => { setView("grid"); setPage(1); }}
            className={`px-2 ${view === "grid" ? "bg-neutral-800 text-white" : "text-neutral-500"}`}
          >
            <LayoutGrid className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-8">
        {/* Sidebar Filters */}
        <aside className="w-full lg:w-56 shrink-0">
          {/* Search */}
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

        {/* Main Content */}
        <div className="flex-1 min-w-0">
          {loading ? (
            view === "table" ? (
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
            ) : (
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
            )
          ) : view === "table" ? (
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
