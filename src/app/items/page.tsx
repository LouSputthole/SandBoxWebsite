import { ItemsBrowser } from "./items-browser";
import { getItems } from "@/lib/services/items-query";
import { prisma } from "@/lib/db";

// ISR — page is regenerated every 5 minutes so search engines get cached HTML
// without us hitting the DB on every request. Filter changes are still
// fully interactive client-side after hydration.
export const revalidate = 300;

// Grid page size — keep in sync with PAGE_SIZE in items-browser.tsx so the
// first server paint and the client fetches agree on totalPages.
const PAGE_SIZE = 20;

interface PageProps {
  searchParams: Promise<{
    q?: string;
    type?: string;
    minPrice?: string;
    maxPrice?: string;
    sort?: string;
    page?: string;
    hasSupply?: string;
    isLimited?: string;
  }>;
}

export default async function BrowsePage({ searchParams }: PageProps) {
  const sp = await searchParams;

  // Fetch the first paint server-side. Client components ship with real
  // initial data so Googlebot (and the user's first frame) sees real items
  // — never a loading skeleton on the initial render. We also pull the
  // catalog-wide per-type counts for the filter chips (these are full-catalog
  // totals, independent of the active filter, matching the Arcade mockup).
  const [result, typeGroups] = await Promise.all([
    getItems({
      q: sp.q,
      type: sp.type,
      minPrice: sp.minPrice,
      maxPrice: sp.maxPrice,
      sort: sp.sort ?? "name-asc",
      page: sp.page ?? "1",
      limit: String(PAGE_SIZE),
      hasSupply: sp.hasSupply,
      isLimited: sp.isLimited,
    }),
    prisma.item.groupBy({
      by: ["type"],
      _count: { _all: true },
    }),
  ]);

  const typeCounts: Record<string, number> = {};
  let catalogTotal = 0;
  for (const group of typeGroups) {
    typeCounts[group.type] = group._count._all;
    catalogTotal += group._count._all;
  }

  return (
    <ItemsBrowser
      initialState={{
        items: result.items,
        total: result.total,
        totalPages: result.totalPages,
        page: result.page,
        search: sp.q ?? "",
        typeCounts,
        catalogTotal,
        filters: {
          type: sp.type ?? "",
          minPrice: sp.minPrice ?? "",
          maxPrice: sp.maxPrice ?? "",
          sort: sp.sort ?? "name-asc",
        },
      }}
    />
  );
}
