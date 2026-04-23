import Link from "next/link";
import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { ItemImage } from "@/components/items/item-image";
import { formatPriceChange } from "@/lib/utils";
import { Price } from "@/components/ui/price";
import { GitCompare } from "lucide-react";
import { ItemSelect } from "./item-select";

export const revalidate = 300;

export const metadata: Metadata = {
  title: "Compare S&box Skins",
  description:
    "Compare any two S&box skins side-by-side: price, 24h change, supply, owners, scarcity score, and more. Get the data before you buy.",
  alternates: { canonical: "/compare" },
};

interface PageProps {
  searchParams: Promise<{ a?: string; b?: string }>;
}

export default async function ComparePage({ searchParams }: PageProps) {
  const { a, b } = await searchParams;

  const [itemA, itemB, allItems] = await Promise.all([
    a ? prisma.item.findFirst({ where: { OR: [{ slug: a }, { id: a }] } }) : null,
    b ? prisma.item.findFirst({ where: { OR: [{ slug: b }, { id: b }] } }) : null,
    prisma.item.findMany({
      select: { slug: true, name: true, currentPrice: true },
      orderBy: { currentPrice: "desc" },
      take: 500,
    }),
  ]);

  return (
    <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2 rounded-lg bg-cyan-500/10">
            <GitCompare className="h-5 w-5 text-cyan-400" />
          </div>
          <h1 className="text-2xl font-bold text-white">Compare Skins</h1>
        </div>
        <p className="text-sm text-neutral-400">
          Pick any two S&box skins to compare prices, supply, scarcity, and market activity side-by-side.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
        <ItemSelector label="Item A" selected={a} current={itemA} otherParam="b" otherValue={b} options={allItems} />
        <ItemSelector label="Item B" selected={b} current={itemB} otherParam="a" otherValue={a} options={allItems} />
      </div>

      {itemA && itemB ? (
        <ComparisonTable itemA={itemA} itemB={itemB} />
      ) : (
        <div className="rounded-xl border border-neutral-800 bg-neutral-900/30 p-12 text-center">
          <p className="text-neutral-500 text-sm">
            {!itemA && !itemB
              ? "Pick two items above to see a side-by-side comparison."
              : "Pick the other item to see the comparison."}
          </p>
        </div>
      )}
    </div>
  );
}

function ItemSelector({
  label,
  selected,
  current,
  otherParam,
  otherValue,
  options,
}: {
  label: string;
  selected: string | undefined;
  current: { name: string; imageUrl: string | null; type: string; slug: string; currentPrice: number | null } | null;
  otherParam: string;
  otherValue: string | undefined;
  options: { slug: string; name: string; currentPrice: number | null }[];
}) {
  const param = label === "Item A" ? "a" : "b";
  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-900/30 p-4">
      <label className="text-xs uppercase tracking-wider text-neutral-500 mb-2 block">{label}</label>
      {current && (
        <div className="flex items-center gap-3 mb-3">
          <ItemImage src={current.imageUrl} name={current.name} type={current.type} size="sm" className="h-10 w-10 rounded-md border border-neutral-700/50" />
          <div className="min-w-0 flex-1">
            <p className="text-sm text-white truncate">{current.name}</p>
            <p className="text-xs text-neutral-500"><Price amount={current.currentPrice ?? 0} /></p>
          </div>
        </div>
      )}
      <ItemSelect
        name={param}
        defaultValue={selected ?? ""}
        otherParamName={otherParam}
        otherParamValue={otherValue}
        options={options}
      />
    </div>
  );
}

function ComparisonTable({
  itemA,
  itemB,
}: {
  itemA: Awaited<ReturnType<typeof prisma.item.findFirst>>;
  itemB: Awaited<ReturnType<typeof prisma.item.findFirst>>;
}) {
  if (!itemA || !itemB) return null;

  const rows: { label: string; a: React.ReactNode; b: React.ReactNode; highlight?: "a" | "b" | null }[] = [
    {
      label: "Price",
      a: <Price amount={itemA.currentPrice ?? 0} />,
      b: <Price amount={itemB.currentPrice ?? 0} />,
      highlight: cmp(itemA.currentPrice, itemB.currentPrice, "higher"),
    },
    {
      label: "24h change",
      a: <ChangeCell v={itemA.priceChange24h} />,
      b: <ChangeCell v={itemB.priceChange24h} />,
      highlight: cmp(itemA.priceChange24h, itemB.priceChange24h, "higher"),
    },
    {
      label: "Scarcity score",
      a: itemA.scarcityScore?.toFixed(0) ?? "—",
      b: itemB.scarcityScore?.toFixed(0) ?? "—",
      highlight: cmp(itemA.scarcityScore, itemB.scarcityScore, "higher"),
    },
    {
      label: "Total supply",
      a: itemA.totalSupply?.toLocaleString() ?? "—",
      b: itemB.totalSupply?.toLocaleString() ?? "—",
      highlight: cmp(itemA.totalSupply, itemB.totalSupply, "lower"),
    },
    {
      label: "Unique owners",
      a: itemA.uniqueOwners?.toLocaleString() ?? "—",
      b: itemB.uniqueOwners?.toLocaleString() ?? "—",
      highlight: null,
    },
    {
      label: "Sold (24h)",
      a: itemA.soldPast24h?.toLocaleString() ?? "—",
      b: itemB.soldPast24h?.toLocaleString() ?? "—",
      highlight: cmp(itemA.soldPast24h, itemB.soldPast24h, "higher"),
    },
    {
      label: "On market",
      a: itemA.supplyOnMarket?.toLocaleString() ?? "—",
      b: itemB.supplyOnMarket?.toLocaleString() ?? "—",
      highlight: null,
    },
    {
      label: "Category",
      a: itemA.category ?? itemA.type,
      b: itemB.category ?? itemB.type,
      highlight: null,
    },
    {
      label: "Release",
      a: itemA.releaseDate ? itemA.releaseDate.toLocaleDateString() : "—",
      b: itemB.releaseDate ? itemB.releaseDate.toLocaleDateString() : "—",
      highlight: null,
    },
    {
      label: "Store status",
      a: itemA.isActiveStoreItem ? "In store" : "Not in store",
      b: itemB.isActiveStoreItem ? "In store" : "Not in store",
      highlight: null,
    },
  ];

  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-900/50 overflow-hidden">
      <div className="grid grid-cols-[1fr_1fr_1fr] gap-0 border-b border-neutral-800 bg-neutral-900">
        <div className="px-4 py-3 text-xs uppercase tracking-wider text-neutral-500">Metric</div>
        <ItemColumn item={itemA} />
        <ItemColumn item={itemB} />
      </div>
      {rows.map((row, i) => (
        <div
          key={i}
          className="grid grid-cols-[1fr_1fr_1fr] gap-0 border-b border-neutral-800/50 last:border-b-0"
        >
          <div className="px-4 py-3 text-sm text-neutral-400">{row.label}</div>
          <div className={`px-4 py-3 text-sm ${row.highlight === "a" ? "text-emerald-400 font-semibold" : "text-white"}`}>
            {row.a}
          </div>
          <div className={`px-4 py-3 text-sm ${row.highlight === "b" ? "text-emerald-400 font-semibold" : "text-white"}`}>
            {row.b}
          </div>
        </div>
      ))}
    </div>
  );
}

function ItemColumn({ item }: { item: { name: string; slug: string; imageUrl: string | null; type: string } }) {
  return (
    <Link href={`/items/${item.slug}`} className="px-4 py-3 flex items-center gap-3 hover:bg-neutral-800/30 transition-colors group">
      <ItemImage src={item.imageUrl} name={item.name} type={item.type} size="sm" className="h-8 w-8 rounded-md border border-neutral-700/50 shrink-0" />
      <span className="text-sm font-medium text-white group-hover:text-cyan-300 truncate">{item.name}</span>
    </Link>
  );
}

function ChangeCell({ v }: { v: number | null }) {
  const x = v ?? 0;
  return (
    <span className={x > 0 ? "text-emerald-400" : x < 0 ? "text-red-400" : "text-neutral-500"}>
      {formatPriceChange(x)}
    </span>
  );
}

// Returns which side to highlight. direction=higher means higher value wins.
function cmp(a: number | null | undefined, b: number | null | undefined, direction: "higher" | "lower"): "a" | "b" | null {
  if (a == null || b == null || a === b) return null;
  if (direction === "higher") return a > b ? "a" : "b";
  return a < b ? "a" : "b";
}
