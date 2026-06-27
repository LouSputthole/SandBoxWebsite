import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { SkinPicker } from "./_components/skin-picker";
import {
  ComparisonPanel,
  type ComparisonColumn,
} from "./_components/comparison-panel";
import { toComparedItem, type RawCompareItem } from "./_components/metrics";

export const revalidate = 300;

export const metadata: Metadata = {
  title: "Compare S&box Skins",
  description:
    "Put any S&box skins head to head — price, 24h/7d/30d momentum, supply, owners, and scarcity side by side. Get the data before you buy.",
  alternates: { canonical: "/compare" },
};

// Up to four skins, one fixed query-param slot each. Order is preserved so
// add/remove of one column leaves the others where they are.
const SLOTS = ["a", "b", "c", "d"] as const;

interface PageProps {
  searchParams: Promise<Record<string, string | undefined>>;
}

export default async function ComparePage({ searchParams }: PageProps) {
  const params = await searchParams;

  // Slots the user has actually filled, in slot order.
  const selected = SLOTS.map((slot) => ({ slot, value: params[slot] })).filter(
    (s): s is { slot: (typeof SLOTS)[number]; value: string } => !!s.value,
  );
  const slugs = selected.map((s) => s.value);

  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [itemsRaw, allItems] = await Promise.all([
    slugs.length
      ? prisma.item.findMany({
          where: { OR: slugs.flatMap((v) => [{ slug: v }, { id: v }]) },
          include: {
            priceHistory: {
              where: { timestamp: { gte: since } },
              orderBy: { timestamp: "asc" },
              select: { price: true, timestamp: true },
            },
          },
        })
      : Promise.resolve([]),
    prisma.item.findMany({
      select: { slug: true, name: true, currentPrice: true },
      orderBy: { currentPrice: "desc" },
      take: 500,
    }),
  ]);

  const resolve = (value: string) =>
    itemsRaw.find((it) => it.slug === value || it.id === value) ?? null;

  // Resolved columns in slot order. Drop slots whose value no longer matches
  // a real item (e.g. a renamed/removed skin) so the grid stays consistent.
  const resolved = selected
    .map((s) => ({ slot: s.slot, value: s.value, item: resolve(s.value) }))
    .filter((s): s is typeof s & { item: RawCompareItem } => !!s.item);

  // Hidden inputs carried by the picker so adding a column preserves the rest.
  const preserve = resolved.map((r) => ({ name: r.slot, value: r.value }));

  const columns: ComparisonColumn[] = resolved.map((r) => {
    const others = resolved.filter((o) => o.slot !== r.slot);
    const qs = others.map((o) => `${o.slot}=${encodeURIComponent(o.value)}`);
    return {
      item: toComparedItem(r.item),
      removeHref: qs.length ? `/compare?${qs.join("&")}` : "/compare",
    };
  });

  // Free slot for the next add (first unused), and options without dupes.
  const usedSlots = new Set(resolved.map((r) => r.slot));
  const freeSlot = SLOTS.find((s) => !usedSlots.has(s));
  const chosenSlugs = new Set(resolved.map((r) => r.item.slug));
  const options = allItems.filter((o) => !chosenSlugs.has(o.slug));

  const canAdd = !!freeSlot && options.length > 0;

  return (
    <div className="mx-auto max-w-[1100px] px-4 pb-12 pt-8 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-[34px] font-extrabold leading-tight tracking-[-0.02em] text-[var(--tx)] sm:text-[38px]">
            Compare skins
          </h1>
          <p className="mt-2 max-w-2xl text-[14.5px] text-[var(--mut)]">
            Put any S&box skins head to head — price, momentum, supply and
            scarcity, side by side.
          </p>
        </div>
        {columns.length > 0 && canAdd && freeSlot && (
          <SkinPicker
            slot={freeSlot}
            preserve={preserve}
            options={options}
            className="sm:w-[260px]"
          />
        )}
      </div>

      {columns.length > 0 ? (
        <>
          <ComparisonPanel columns={columns} />
          <p className="mt-[18px] text-center text-[12.5px] text-[var(--faint)]">
            Add up to 4 skins to compare. Best value in each row is highlighted in{" "}
            <span className="text-[var(--accent)]">purple</span>.
          </p>
        </>
      ) : (
        <div className="rounded-[20px] border border-[var(--line)] bg-[var(--panel)] px-6 py-16 text-center">
          <p className="mx-auto mb-5 max-w-md text-sm text-[var(--mut)]">
            Pick a skin to start a side-by-side comparison — price, momentum,
            supply and scarcity for up to 4 skins.
          </p>
          {freeSlot && (
            <div className="mx-auto max-w-xs">
              <SkinPicker slot={freeSlot} preserve={[]} options={options} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
