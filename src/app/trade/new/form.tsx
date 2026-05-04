"use client";

import { useState, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Plus,
  X,
  Search,
  Loader2,
  AlertCircle,
  ExternalLink,
  Check,
  Backpack,
  DollarSign,
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

/** Shape returned by /api/inventory/match — one entry per hash_name the
 * user owns, with our DB's current catalog metadata (or null if the item
 * isn't in our catalog yet). */
interface InventoryItem {
  name: string;
  slug: string | null;
  type: string;
  imageUrl: string | null;
  quantity: number;
  unitPrice: number | null;
  totalPrice: number | null;
  marketable: boolean;
}

type InventoryState =
  | { status: "loading" }
  | { status: "empty"; reason: string }
  | { status: "failed"; reason: string }
  | { status: "loaded"; items: InventoryItem[] };

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

type MeetingPlace = "steam_trade" | "trading_hub" | "either";

const MEETING_OPTIONS: { value: MeetingPlace; label: string; hint: string }[] = [
  {
    value: "steam_trade",
    label: "Steam trade offer",
    hint: "Standard — buyer hits your trade URL on Steam.",
  },
  {
    value: "trading_hub",
    label: "S&box Trading Hub",
    hint: "Coordinate the swap in-game at the Hub. No trade URL needed — just show up.",
  },
  {
    value: "either",
    label: "Either",
    hint: "Both options offered. Buyer picks whichever they prefer.",
  },
];

let nextKey = 0;
const newKey = () => `${Date.now()}-${++nextKey}`;

export function NewListingForm({
  catalog,
  steamId,
  hasTradeUrl,
  existingTradeUrl,
}: {
  catalog: CatalogItem[];
  steamId: string;
  hasTradeUrl: boolean;
  existingTradeUrl: string | null;
}) {
  const router = useRouter();
  const [side, setSide] = useState<Side>("selling");
  const [meetingPlace, setMeetingPlace] = useState<MeetingPlace>("steam_trade");
  const [description, setDescription] = useState("");
  const [durationDays, setDurationDays] = useState(14);
  const [tradeUrl, setTradeUrl] = useState(existingTradeUrl ?? "");
  const [showTradeUrlEdit, setShowTradeUrlEdit] = useState(!hasTradeUrl);
  const [offering, setOffering] = useState<DraftLineItem[]>([]);
  const [wanting, setWanting] = useState<DraftLineItem[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inventory, setInventory] = useState<InventoryState>({ status: "loading" });

  // Fetch the signed-in user's Steam inventory once on mount. Runs the
  // same two-step flow as the /inventory page: Steam → match API. Non-
  // blocking for the rest of the form; while this loads, the Offering
  // picker shows a spinner but the user can still fill in description,
  // wanting, etc.
  useEffect(() => {
    let cancelled = false;
    async function loadInventory() {
      try {
        const invRes = await fetch(`/api/inventory/fetch?steamid=${steamId}`);
        if (!invRes.ok) {
          if (cancelled) return;
          const body = await invRes.json().catch(() => ({}));
          setInventory({
            status: "failed",
            reason:
              body.error ??
              `Couldn't load your inventory (HTTP ${invRes.status}).`,
          });
          return;
        }
        const inv = await invRes.json();
        if (cancelled) return;

        if (inv.success === false || inv.success === 0) {
          setInventory({
            status: "failed",
            reason:
              inv.error ??
              "Steam returned an error — inventory may be private.",
          });
          return;
        }

        if (!inv.assets || inv.assets.length === 0) {
          setInventory({
            status: "empty",
            reason: "Your inventory is empty or has no S&box items.",
          });
          return;
        }

        // Aggregate raw Steam assets by market_hash_name (same pattern as
        // the /inventory page). We POST the aggregated list to our match
        // endpoint to enrich with catalog slug/price data.
        type InvDesc = NonNullable<typeof inv.descriptions>[number];
        const descMap = new Map<string, InvDesc>();
        if (inv.descriptions) {
          for (const d of inv.descriptions) {
            descMap.set(`${d.classid}_${d.instanceid}`, d);
          }
        }
        const counts = new Map<
          string,
          {
            hashName: string;
            quantity: number;
            name: string;
            type: string;
            iconUrl?: string;
            marketable: number;
          }
        >();
        for (const asset of inv.assets) {
          const desc = descMap.get(`${asset.classid}_${asset.instanceid}`);
          if (!desc) continue;
          const qty = parseInt(asset.amount, 10) || 1;
          const existing = counts.get(desc.market_hash_name);
          if (existing) {
            existing.quantity += qty;
          } else {
            counts.set(desc.market_hash_name, {
              hashName: desc.market_hash_name,
              quantity: qty,
              name: desc.name,
              type: desc.type ?? "unknown",
              iconUrl: desc.icon_url,
              marketable: desc.marketable,
            });
          }
        }

        const matchRes = await fetch("/api/inventory/match", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ items: Array.from(counts.values()) }),
        });
        if (cancelled) return;
        if (!matchRes.ok) {
          const body = await matchRes.json().catch(() => ({}));
          setInventory({
            status: "failed",
            reason: body.error ?? "Couldn't match inventory against catalog.",
          });
          return;
        }
        const matchData = await matchRes.json();
        if (cancelled) return;

        // Filter to catalog-matched items — we need a slug to build a
        // valid listing line item. Items without a slug (brand new, not
        // yet in our DB) would have to use the custom-name path, which
        // is fine but not the picker's job; they can still free-text it.
        const owned: InventoryItem[] = (matchData.items ?? []).filter(
          (it: InventoryItem) => it.slug != null,
        );
        if (owned.length === 0) {
          setInventory({
            status: "empty",
            reason:
              "No S&box items in your inventory match our catalog yet.",
          });
          return;
        }
        setInventory({ status: "loaded", items: owned });
      } catch (err) {
        if (cancelled) return;
        setInventory({
          status: "failed",
          reason: err instanceof Error ? err.message : "Unknown error",
        });
      }
    }
    loadInventory();
    return () => {
      cancelled = true;
    };
  }, [steamId]);

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const body = {
        side,
        description,
        durationDays,
        meetingPlace,
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

      {/* Meeting place selector — where the trade actually happens.
          Steam trade is the default + traditional path. Trading Hub
          partner option lets users coordinate face-to-face in-game,
          which is good for users without a Steam trade URL set up
          and for anyone who'd rather meet a real person than send a
          trade offer. "Either" shows both CTAs on the listing. */}
      <Field
        label="Meeting place"
        hint="How buyers complete the trade with you."
      >
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {MEETING_OPTIONS.map((opt) => {
            const active = meetingPlace === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => setMeetingPlace(opt.value)}
                className={`text-left rounded-lg border px-3 py-2 transition ${
                  active
                    ? "border-purple-500/50 bg-purple-500/10"
                    : "border-neutral-800 bg-neutral-900/50 hover:border-neutral-700"
                }`}
              >
                <div
                  className={`text-sm font-semibold ${active ? "text-purple-200" : "text-white"}`}
                >
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

      {/* Item lists — Offering pulls from the user's Steam inventory
          (you can only offer what you own). Wanting stays on the full
          catalog search since you can want anything. */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <OfferingPicker
          items={offering}
          setItems={setOffering}
          inventory={inventory}
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

      {/* Trade URL — required for Steam-trade listings, optional for
          Trading-Hub-only ones (the in-game meet-up doesn't need a
          trade URL). Field stays visible either way so users can still
          paste it for future use even if this listing won't use it. */}
      <Field
        label={
          meetingPlace === "trading_hub"
            ? "Steam trade URL (optional)"
            : "Steam trade URL"
        }
        hint={
          meetingPlace === "trading_hub"
            ? "Not needed for Trading Hub meet-ups, but you can paste it here for future Steam-trade listings."
            : hasTradeUrl
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
            // Trade URL is only required when the listing accepts
            // Steam trades — trading_hub-only listings work without it.
            (meetingPlace !== "trading_hub" &&
              showTradeUrlEdit &&
              tradeUrl.trim().length === 0)
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

/**
 * Inline "+ Cash $___" quick-add. Creates a line item with a
 * canonical "$<amount> cash" customName so listings render the same
 * way regardless of which picker added it. Payment method (PayPal,
 * Venmo, etc.) stays in the description field — that's where
 * specifics belong.
 */
function CashAddButton({
  onAdd,
}: {
  onAdd: (li: DraftLineItem) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [amount, setAmount] = useState("");

  const submit = () => {
    const n = Number(amount);
    if (!Number.isFinite(n) || n <= 0) return;
    // Round to cents and strip trailing zeros so "$50" stays "$50",
    // "$12.50" stays "$12.50".
    const rounded = Math.round(n * 100) / 100;
    const display = Number.isInteger(rounded)
      ? `$${rounded} cash`
      : `$${rounded.toFixed(2)} cash`;
    onAdd({ key: newKey(), customName: display, quantity: 1 });
    setAmount("");
    setEditing(false);
  };

  if (editing) {
    return (
      <div className="rounded-md border border-emerald-700/40 bg-emerald-500/5 p-2 mb-2 flex items-center gap-2">
        <DollarSign className="h-3.5 w-3.5 text-emerald-300 shrink-0" />
        <input
          type="number"
          autoFocus
          inputMode="decimal"
          min={0}
          step={1}
          placeholder="50"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              submit();
            } else if (e.key === "Escape") {
              setEditing(false);
              setAmount("");
            }
          }}
          className="flex-1 px-2 py-1 rounded border border-neutral-800 bg-neutral-900 text-sm text-white placeholder:text-neutral-600 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-emerald-500"
        />
        <button
          type="button"
          onClick={() => {
            setEditing(false);
            setAmount("");
          }}
          className="text-[11px] text-neutral-500 hover:text-white transition"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={!amount || Number(amount) <= 0}
          className="text-[11px] text-emerald-300 hover:text-emerald-200 transition disabled:text-neutral-600 disabled:cursor-not-allowed"
        >
          Add
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      className="w-full inline-flex items-center justify-center gap-1.5 text-xs text-emerald-300/80 hover:text-emerald-300 border border-dashed border-emerald-700/40 hover:border-emerald-500/60 rounded-md py-2 mb-2 transition"
    >
      <DollarSign className="h-3.5 w-3.5" />
      Add cash
    </button>
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
        <>
          <CashAddButton
            onAdd={(picked) => setItems([...items, picked])}
          />
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="w-full inline-flex items-center justify-center gap-1.5 text-xs text-neutral-400 hover:text-white border border-dashed border-neutral-800 hover:border-neutral-600 rounded-md py-2 transition"
          >
            <Plus className="h-3.5 w-3.5" />
            Add item
          </button>
        </>
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
              + Add off-catalog (TF2 keys, Rust skins, etc.)
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

/**
 * Offering-side item picker. You can only offer items you own, so this
 * pulls from the user's Steam inventory rather than the full catalog.
 * Shows a grid of owned items you tap to add. Already-added items show
 * a checkmark + let you tap again to remove. Also keeps the "add
 * off-catalog" free-text path for offering TF2 keys / cash / etc.
 *
 * On inventory-fetch failure, falls back to the catalog autocomplete
 * so a user with a private profile or a flaky Steam response can still
 * create a listing.
 */
function OfferingPicker({
  items,
  setItems,
  inventory,
  catalog,
}: {
  items: DraftLineItem[];
  setItems: (next: DraftLineItem[]) => void;
  inventory: InventoryState;
  catalog: CatalogItem[];
}) {
  const [addingCustom, setAddingCustom] = useState(false);
  const [customName, setCustomName] = useState("");

  const totalValue = items.reduce(
    (sum, li) => sum + (li.catalogItem?.currentPrice ?? 0) * li.quantity,
    0,
  );

  // Fast lookup: which catalog itemIds are already in the draft offering,
  // so the grid can render a checkmark + let re-taps remove them.
  const selectedItemIds = useMemo(
    () => new Set(items.map((i) => i.itemId).filter((x): x is string => !!x)),
    [items],
  );

  const addFromInventory = (inv: InventoryItem) => {
    // Map inventory slug → catalog entry (the match endpoint gives us
    // slug but not the full catalog row we need for DraftLineItem).
    const cat = catalog.find((c) => c.slug === inv.slug);
    if (!cat) return;
    if (selectedItemIds.has(cat.id)) {
      // Second tap — remove
      setItems(items.filter((i) => i.itemId !== cat.id));
      return;
    }
    setItems([
      ...items,
      {
        key: newKey(),
        itemId: cat.id,
        catalogItem: cat,
        quantity: 1,
      },
    ]);
  };

  const addCustom = () => {
    const name = customName.trim();
    if (!name) return;
    setItems([...items, { key: newKey(), customName: name, quantity: 1 }]);
    setCustomName("");
    setAddingCustom(false);
  };

  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-900/40 p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="text-[11px] uppercase tracking-wider font-semibold text-emerald-400">
          Offering
        </div>
        {totalValue > 0 && (
          <span className="text-[11px] text-neutral-500">
            ~{formatPrice(totalValue)}
          </span>
        )}
      </div>

      {/* Selected items */}
      <div className="space-y-1.5 mb-3">
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
      </div>

      {/* Inventory grid */}
      {inventory.status === "loading" && (
        <div className="rounded-md border border-neutral-800 bg-neutral-950/50 px-3 py-6 text-center">
          <Loader2 className="h-4 w-4 animate-spin mx-auto mb-2 text-neutral-500" />
          <p className="text-xs text-neutral-500">Loading your Steam inventory…</p>
        </div>
      )}

      {inventory.status === "loaded" && (
        <>
          <div className="flex items-center gap-1.5 mb-2">
            <Backpack className="h-3 w-3 text-neutral-500" />
            <span className="text-[10px] uppercase tracking-wider text-neutral-500">
              From your inventory — tap to {items.length > 0 ? "add/remove" : "add"}
            </span>
          </div>
          <div className="grid grid-cols-4 sm:grid-cols-5 gap-1.5 mb-3 max-h-64 overflow-y-auto pr-1">
            {inventory.items.map((inv) => {
              const cat = catalog.find((c) => c.slug === inv.slug);
              const selected = cat ? selectedItemIds.has(cat.id) : false;
              return (
                <button
                  key={inv.slug}
                  type="button"
                  onClick={() => addFromInventory(inv)}
                  disabled={!cat}
                  className={`relative aspect-square rounded-md border overflow-hidden transition ${
                    selected
                      ? "border-emerald-500/60 bg-emerald-500/10"
                      : "border-neutral-800 bg-neutral-950/50 hover:border-neutral-600"
                  } disabled:opacity-40 disabled:cursor-not-allowed`}
                  title={`${inv.name}${inv.quantity > 1 ? ` ×${inv.quantity}` : ""}${inv.unitPrice != null ? ` · ${formatPrice(inv.unitPrice)}` : ""}`}
                >
                  <ItemImage
                    src={inv.imageUrl}
                    name={inv.name}
                    type={inv.type}
                    size="sm"
                    className="h-full w-full"
                  />
                  {inv.quantity > 1 && (
                    <span className="absolute top-0.5 right-0.5 text-[9px] font-semibold bg-black/70 text-white px-1 py-0.5 rounded">
                      ×{inv.quantity}
                    </span>
                  )}
                  {selected && (
                    <span className="absolute inset-0 flex items-center justify-center bg-emerald-500/20">
                      <Check className="h-5 w-5 text-emerald-300" />
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </>
      )}

      {(inventory.status === "empty" || inventory.status === "failed") && (
        <div className="rounded-md border border-amber-500/20 bg-amber-500/5 px-3 py-2 mb-3">
          <p className="text-[11px] text-amber-300/90 leading-relaxed">
            {inventory.reason} You can still pick from the catalog below.
          </p>
        </div>
      )}

      {/* Catalog-search fallback — shown when inventory can't load.
          Lets the user still pick from our catalog the same way the
          Wanting picker works. Reuses the shared AddRow component. */}
      {(inventory.status === "empty" || inventory.status === "failed") && (
        <CatalogAddButton
          items={items}
          setItems={setItems}
          catalog={catalog}
        />
      )}

      {/* Cash quick-add — most common off-catalog payment, deserves a
          one-click button instead of free-text. */}
      <CashAddButton onAdd={(picked) => setItems([...items, picked])} />

      {/* Off-catalog adder — TF2 keys, etc. Always available; users
          might offer a mix of owned items + cash + other things. */}
      {addingCustom ? (
        <div className="rounded-md border border-neutral-700 bg-neutral-950 p-2 space-y-2">
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
              onClick={() => {
                setAddingCustom(false);
                setCustomName("");
              }}
              className="text-neutral-500 hover:text-white transition"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={addCustom}
              disabled={customName.trim().length === 0}
              className="text-purple-300 hover:text-purple-200 transition disabled:text-neutral-600 disabled:cursor-not-allowed"
            >
              Add
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAddingCustom(true)}
          className="w-full inline-flex items-center justify-center gap-1.5 text-xs text-neutral-400 hover:text-white border border-dashed border-neutral-800 hover:border-neutral-600 rounded-md py-2 transition"
        >
          <Plus className="h-3.5 w-3.5" />
          Add off-catalog (TF2 keys, Rust skins, etc.)
        </button>
      )}
    </div>
  );
}

/**
 * Small wrapper around AddRow so the offering picker can reuse the
 * same catalog-search UX as the wanting picker when inventory is
 * unavailable. Manages its own open/closed state locally.
 */
function CatalogAddButton({
  items,
  setItems,
  catalog,
}: {
  items: DraftLineItem[];
  setItems: (next: DraftLineItem[]) => void;
  catalog: CatalogItem[];
}) {
  const [adding, setAdding] = useState(false);
  if (adding) {
    return (
      <div className="mb-2">
        <AddRow
          catalog={catalog}
          existingIds={
            new Set(
              items.map((i) => i.itemId).filter((x): x is string => !!x),
            )
          }
          onPick={(picked) => {
            setItems([...items, picked]);
            setAdding(false);
          }}
          onCancel={() => setAdding(false)}
        />
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={() => setAdding(true)}
      className="w-full inline-flex items-center justify-center gap-1.5 text-xs text-neutral-400 hover:text-white border border-dashed border-neutral-800 hover:border-neutral-600 rounded-md py-2 mb-2 transition"
    >
      <Search className="h-3.5 w-3.5" />
      Search catalog
    </button>
  );
}
