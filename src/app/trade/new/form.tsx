"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  Plus,
  X,
  Search,
  Loader2,
  AlertCircle,
  ExternalLink,
  Check,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ItemImage } from "@/components/items/item-image";
import { formatPrice } from "@/lib/utils";

interface CatalogItem {
  id: string;
  name: string;
  slug: string;
  imageUrl: string | null;
  type: string;
  currentPrice: number | null;
}

type Side = "selling" | "buying" | "both";

interface DraftLineItem {
  // Stable client-side key — not sent to the server.
  key: string;
  itemId?: string;
  catalogItem?: CatalogItem;
  customName?: string;
  quantity: number;
}

const SIDE_OPTIONS: { value: Side; label: string; hint: string }[] = [
  { value: "selling", label: "Selling", hint: "I have items, looking for cash/keys/anything" },
  { value: "buying", label: "Buying", hint: "I want items, paying with cash/keys/items" },
  { value: "both", label: "Item ↔ item", hint: "Trading specific items for specific items" },
];

let nextKey = 0;
const newKey = () => `${Date.now()}-${++nextKey}`;

export function NewListingForm({
  catalog,
  hasTradeUrl,
  existingTradeUrl,
}: {
  catalog: CatalogItem[];
  hasTradeUrl: boolean;
  existingTradeUrl: string | null;
}) {
  const router = useRouter();
  const [side, setSide] = useState<Side>("selling");
  const [description, setDescription] = useState("");
  const [durationDays, setDurationDays] = useState(14);
  const [tradeUrl, setTradeUrl] = useState(existingTradeUrl ?? "");
  const [showTradeUrlEdit, setShowTradeUrlEdit] = useState(!hasTradeUrl);
  const [offering, setOffering] = useState<DraftLineItem[]>([]);
  const [wanting, setWanting] = useState<DraftLineItem[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const body = {
        side,
        description,
        durationDays,
        steamTradeUrl: showTradeUrlEdit ? tradeUrl : undefined,
        offering: offering.map((li) => ({
          itemId: li.itemId,
          customName: li.customName,
          quantity: li.quantity,
        })),
        wanting: wanting.map((li) => ({
          itemId: li.itemId,
          customName: li.customName,
          quantity: li.quantity,
        })),
      };
      const res = await fetch("/api/trade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      router.push(`/trade/${data.listing.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create listing");
      setSubmitting(false);
    }
  };

  const charsLeft = 1000 - description.length;
  const totalLineItems = offering.length + wanting.length;

  return (
    <div className="space-y-6">
      {/* Side selector */}
      <Field label="Listing type">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {SIDE_OPTIONS.map((opt) => {
            const active = side === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => setSide(opt.value)}
                className={`text-left rounded-lg border px-3 py-2 transition ${
                  active
                    ? "border-purple-500/50 bg-purple-500/10"
                    : "border-neutral-800 bg-neutral-900/50 hover:border-neutral-700"
                }`}
              >
                <div className={`text-sm font-semibold ${active ? "text-purple-200" : "text-white"}`}>
                  {opt.label}
                </div>
                <div className="text-[11px] text-neutral-500 mt-0.5 leading-tight">
                  {opt.hint}
                </div>
              </button>
            );
          })}
        </div>
      </Field>

      {/* Description */}
      <Field
        label="Description"
        hint={`Free text — what you're after, payment methods, contact preferences. ${charsLeft} chars left.`}
      >
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value.slice(0, 1000))}
          placeholder={
            side === "selling"
              ? "Selling these items, accepting offers in cash/keys. DM on Discord @mytag or Steam to negotiate."
              : side === "buying"
                ? "Looking to buy these items. Paying $X each via PayPal or TF2 keys."
                : "Trading the items below for the items I want. Make an offer of equal value or slightly in your favor :D"
          }
          rows={4}
          className="w-full rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-600 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-purple-500 resize-none"
        />
      </Field>

      {/* Item lists */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <ItemListEditor
          label="Offering"
          tone="emerald"
          items={offering}
          setItems={setOffering}
          catalog={catalog}
        />
        <ItemListEditor
          label="Wanting"
          tone="blue"
          items={wanting}
          setItems={setWanting}
          catalog={catalog}
        />
      </div>

      {/* Duration */}
      <Field label="Duration" hint="Listing auto-expires after this many days.">
        <div className="flex items-center gap-3">
          <input
            type="range"
            min={1}
            max={30}
            value={durationDays}
            onChange={(e) => setDurationDays(Number(e.target.value))}
            className="flex-1 accent-purple-500"
          />
          <span className="text-sm font-semibold text-white w-16 text-right tabular-nums">
            {durationDays} day{durationDays === 1 ? "" : "s"}
          </span>
        </div>
      </Field>

      {/* Trade URL */}
      <Field
        label="Steam trade URL"
        hint={
          hasTradeUrl
            ? "We have your trade URL on file. Edit it only if it changed."
            : "Required so other users can open a trade with you. Get yours at: Steam → Inventory → Trade Offers → 'Who can send me Trade Offers?' → bottom of the page."
        }
      >
        {hasTradeUrl && !showTradeUrlEdit ? (
          <div className="flex items-center justify-between gap-3 rounded-lg border border-neutral-800 bg-neutral-900/50 px-3 py-2">
            <div className="flex items-center gap-2 text-sm text-neutral-300 min-w-0">
              <Check className="h-4 w-4 text-emerald-400 shrink-0" />
              <span className="truncate font-mono text-xs">
                {existingTradeUrl}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setShowTradeUrlEdit(true)}
              className="text-xs text-neutral-500 hover:text-white transition shrink-0"
            >
              Change
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            <Input
              type="url"
              placeholder="https://steamcommunity.com/tradeoffer/new/?partner=...&token=..."
              value={tradeUrl}
              onChange={(e) => setTradeUrl(e.target.value)}
              className="font-mono text-xs"
            />
            <a
              href="https://steamcommunity.com/my/tradeoffers/privacy"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-purple-400 hover:text-purple-300"
            >
              Find your trade URL
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        )}
      </Field>

      {/* Errors */}
      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 flex items-start gap-2">
          <AlertCircle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
          <p className="text-sm text-red-300">{error}</p>
        </div>
      )}

      {/* Submit */}
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs text-neutral-500">
          {totalLineItems} item{totalLineItems === 1 ? "" : "s"} · {durationDays}d
        </span>
        <Button
          onClick={submit}
          disabled={
            submitting ||
            description.trim().length === 0 ||
            (showTradeUrlEdit && tradeUrl.trim().length === 0)
          }
          className="bg-purple-600 hover:bg-purple-700 text-white gap-2"
        >
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Post listing
        </Button>
      </div>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-white mb-1">{label}</label>
      {hint && <p className="text-[11px] text-neutral-500 mb-2 leading-relaxed">{hint}</p>}
      {children}
    </div>
  );
}

function ItemListEditor({
  label,
  tone,
  items,
  setItems,
  catalog,
}: {
  label: string;
  tone: "emerald" | "blue";
  items: DraftLineItem[];
  setItems: (next: DraftLineItem[]) => void;
  catalog: CatalogItem[];
}) {
  const [adding, setAdding] = useState(false);
  const toneClass = tone === "emerald" ? "text-emerald-400" : "text-blue-400";
  const totalValue = items.reduce(
    (sum, li) => sum + (li.catalogItem?.currentPrice ?? 0) * li.quantity,
    0,
  );
  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-900/40 p-3">
      <div className="flex items-center justify-between mb-2">
        <div className={`text-[11px] uppercase tracking-wider font-semibold ${toneClass}`}>
          {label}
        </div>
        {totalValue > 0 && (
          <span className="text-[11px] text-neutral-500">
            ~{formatPrice(totalValue)}
          </span>
        )}
      </div>
      <div className="space-y-1.5 mb-2">
        {items.map((li) => (
          <DraftRow
            key={li.key}
            li={li}
            onChange={(next) =>
              setItems(items.map((x) => (x.key === li.key ? next : x)))
            }
            onRemove={() => setItems(items.filter((x) => x.key !== li.key))}
          />
        ))}
        {items.length === 0 && !adding && (
          <p className="text-xs text-neutral-600 italic px-1 py-2">
            No items yet — add some below or describe them in the text.
          </p>
        )}
      </div>
      {adding ? (
        <AddRow
          catalog={catalog}
          existingIds={new Set(items.map((i) => i.itemId).filter((x): x is string => !!x))}
          onPick={(picked) => {
            setItems([...items, picked]);
            setAdding(false);
          }}
          onCancel={() => setAdding(false)}
        />
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="w-full inline-flex items-center justify-center gap-1.5 text-xs text-neutral-400 hover:text-white border border-dashed border-neutral-800 hover:border-neutral-600 rounded-md py-2 transition"
        >
          <Plus className="h-3.5 w-3.5" />
          Add item
        </button>
      )}
    </div>
  );
}

function DraftRow({
  li,
  onChange,
  onRemove,
}: {
  li: DraftLineItem;
  onChange: (next: DraftLineItem) => void;
  onRemove: () => void;
}) {
  return (
    <div className="flex items-center gap-2 rounded-md bg-neutral-950/50 border border-neutral-800 px-2 py-1.5">
      {li.catalogItem ? (
        <div className="h-7 w-7 rounded border border-neutral-700 overflow-hidden shrink-0">
          <ItemImage
            src={li.catalogItem.imageUrl}
            name={li.catalogItem.name}
            type={li.catalogItem.type}
            size="sm"
            className="h-full w-full"
          />
        </div>
      ) : (
        <div className="h-7 w-7 rounded border border-neutral-700 bg-neutral-900 flex items-center justify-center text-[8px] text-neutral-500 shrink-0">
          —
        </div>
      )}
      <div className="flex-1 min-w-0 text-sm text-neutral-200 truncate">
        {li.catalogItem?.name ?? li.customName}
      </div>
      <input
        type="number"
        min={1}
        max={9999}
        value={li.quantity}
        onChange={(e) =>
          onChange({ ...li, quantity: Math.max(1, Number(e.target.value) || 1) })
        }
        className="w-14 rounded border border-neutral-800 bg-neutral-950 px-2 py-0.5 text-xs text-white text-right focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-purple-500"
      />
      <button
        type="button"
        onClick={onRemove}
        className="p-1 text-neutral-500 hover:text-red-400 transition"
        aria-label="Remove"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function AddRow({
  catalog,
  existingIds,
  onPick,
  onCancel,
}: {
  catalog: CatalogItem[];
  existingIds: Set<string>;
  onPick: (item: DraftLineItem) => void;
  onCancel: () => void;
}) {
  const [query, setQuery] = useState("");
  const [showCustom, setShowCustom] = useState(false);
  const [customName, setCustomName] = useState("");

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return catalog
      .filter((c) => !existingIds.has(c.id))
      .filter((c) => c.name.toLowerCase().includes(q))
      .slice(0, 8);
  }, [query, catalog, existingIds]);

  return (
    <div className="rounded-md border border-neutral-700 bg-neutral-950 p-2 space-y-2">
      {!showCustom ? (
        <>
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-neutral-500" />
            <input
              type="text"
              autoFocus
              placeholder="Search S&box items..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full pl-7 pr-2 py-1.5 rounded border border-neutral-800 bg-neutral-900 text-sm text-white placeholder:text-neutral-500 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-purple-500"
            />
          </div>
          {matches.length > 0 && (
            <div className="space-y-1 max-h-56 overflow-y-auto">
              {matches.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() =>
                    onPick({
                      key: newKey(),
                      itemId: m.id,
                      catalogItem: m,
                      quantity: 1,
                    })
                  }
                  className="w-full flex items-center gap-2 text-left rounded px-2 py-1.5 hover:bg-neutral-800/60 transition"
                >
                  <div className="h-6 w-6 rounded border border-neutral-800 overflow-hidden shrink-0">
                    <ItemImage
                      src={m.imageUrl}
                      name={m.name}
                      type={m.type}
                      size="sm"
                      className="h-full w-full"
                    />
                  </div>
                  <span className="flex-1 text-xs text-white truncate">{m.name}</span>
                  {m.currentPrice !== null && (
                    <span className="text-[10px] text-neutral-500 shrink-0">
                      {formatPrice(m.currentPrice)}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
          <div className="flex items-center justify-between text-[11px]">
            <button
              type="button"
              onClick={() => setShowCustom(true)}
              className="text-purple-400 hover:text-purple-300 transition"
            >
              + Add off-catalog (TF2 keys, cash, etc.)
            </button>
            <button
              type="button"
              onClick={onCancel}
              className="text-neutral-500 hover:text-white transition"
            >
              Cancel
            </button>
          </div>
        </>
      ) : (
        <>
          <input
            type="text"
            autoFocus
            placeholder="e.g. TF2 keys, $50 PayPal, Rust skins"
            value={customName}
            maxLength={100}
            onChange={(e) => setCustomName(e.target.value)}
            className="w-full px-2 py-1.5 rounded border border-neutral-800 bg-neutral-900 text-sm text-white placeholder:text-neutral-500 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-purple-500"
          />
          <div className="flex items-center justify-between text-[11px]">
            <button
              type="button"
              onClick={() => setShowCustom(false)}
              className="text-neutral-500 hover:text-white transition"
            >
              ← Back to catalog search
            </button>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onCancel}
                className="text-neutral-500 hover:text-white transition"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={customName.trim().length === 0}
                onClick={() =>
                  onPick({
                    key: newKey(),
                    customName: customName.trim(),
                    quantity: 1,
                  })
                }
                className="text-purple-300 hover:text-purple-200 transition disabled:text-neutral-600 disabled:cursor-not-allowed"
              >
                Add
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
