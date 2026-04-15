import { ItemsBrowser } from "./items-browser";
import { getItems } from "@/lib/services/items-query";

// ISR — page is regenerated every 5 minutes so search engines get cached HTML
// without us hitting the DB on every request. Filter changes are still
// fully interactive client-side after hydration.
export const revalidate = 300;

interface PageProps {
  searchParams: Promise<{
    q?: string;
    type?: string;
    minPrice?: string;
    maxPrice?: string;
    sort?: string;
    page?: string;
    view?: string;
    hasSupply?: string;
    isLimited?: string;
  }>;
}

export default async function BrowsePage({ searchParams }: PageProps) {
  const sp = await searchParams;

  const view: "grid" | "table" = sp.view === "grid" ? "grid" : "table";
  const limit = view === "table" ? 25 : 12;

  // Fetch the first paint server-side. Client components ship with real
  // initial data so Googlebot (and the user's first frame) sees real items
  // — never a loading skeleton on the initial render.
  const result = await getItems({
    q: sp.q,
    type: sp.type,
    minPrice: sp.minPrice,
    maxPrice: sp.maxPrice,
    sort: sp.sort ?? "name-asc",
    page: sp.page ?? "1",
    limit: String(limit),
    hasSupply: sp.hasSupply,
    isLimited: sp.isLimited,
  });

  return (
    <ItemsBrowser
      initialState={{
        items: result.items,
        total: result.total,
        totalPages: result.totalPages,
        page: result.page,
        search: sp.q ?? "",
        view,
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
