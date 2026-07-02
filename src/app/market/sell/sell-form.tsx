"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Wallet, KeyRound, Loader2, CheckCircle2, AlertCircle, Tag } from "lucide-react";
import { formatUsdc, splitFee, usdToUsdcBaseUnits } from "@/lib/market/fees";
import { getPhantom } from "../_components/phantom";

interface InvItem {
  assetId: string;
  classId: string;
  instanceId: string;
  name: string;
  imageUrl: string | null;
}
interface CatalogItem {
  id: string;
  name: string;
}

const norm = (s: string) => s.trim().toLowerCase();

function ErrorLine({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-3 flex items-start gap-1.5 text-sm text-down">
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {children}
    </p>
  );
}

export function SellForm({
  hasWallet,
  hasKey,
  catalog,
}: {
  hasWallet: boolean;
  hasKey: boolean;
  catalog: CatalogItem[];
}) {
  const [walletLinked, setWalletLinked] = useState(hasWallet);
  const [keyLinked, setKeyLinked] = useState(hasKey);

  if (!walletLinked) {
    return <WalletStep onLinked={() => setWalletLinked(true)} />;
  }
  if (!keyLinked) {
    return <KeyStep onLinked={() => setKeyLinked(true)} />;
  }
  return <ListStep catalog={catalog} />;
}

function WalletStep({ onLinked }: { onLinked: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function connect() {
    const p = getPhantom();
    if (!p) {
      setError("Phantom wallet not found — install it at phantom.app.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { publicKey } = await p.connect();
      const res = await fetch("/api/market/wallet", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ address: publicKey.toString() }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Could not link wallet");
      onLinked();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Wallet connection failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <StepCard step={1} title="Connect your Solana wallet" note="This is where your USDC payouts land.">
      <button
        onClick={connect}
        disabled={busy}
        className="flex items-center justify-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wallet className="h-4 w-4" />}
        Connect Phantom
      </button>
      {error ? <ErrorLine>{error}</ErrorLine> : null}
    </StepCard>
  );
}

function KeyStep({ onLinked }: { onLinked: () => void }) {
  const [apiKey, setApiKey] = useState("");
  const [mobileAuth, setMobileAuth] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/market/steam-key", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ apiKey: apiKey.trim(), mobileAuthConfirmed: mobileAuth }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Could not save key");
      onLinked();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save key");
    } finally {
      setBusy(false);
    }
  }

  return (
    <StepCard step={2} title="Link your Steam Web API key" note="Lets us confirm your trade deliveries.">
      <input
        value={apiKey}
        onChange={(e) => setApiKey(e.target.value)}
        placeholder="32-character Steam Web API key"
        className="w-full rounded-xl border border-line bg-bg px-3 py-2.5 font-mono text-sm text-tx outline-none focus:border-accent"
      />
      <a
        href="https://steamcommunity.com/dev/apikey"
        target="_blank"
        rel="noreferrer"
        className="mt-1 inline-block text-xs text-accent hover:underline"
      >
        Get your API key ↗
      </a>
      <label className="mt-3 flex items-start gap-2 text-sm text-mut">
        <input
          type="checkbox"
          checked={mobileAuth}
          onChange={(e) => setMobileAuth(e.target.checked)}
          className="mt-0.5"
        />
        <span>
          I have Steam Guard <span className="text-tx">Mobile Authenticator</span> enabled (required —
          otherwise Steam holds trades up to 15 days).
        </span>
      </label>
      <button
        onClick={submit}
        disabled={busy || !apiKey || !mobileAuth}
        className="mt-4 flex items-center justify-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
        Save &amp; continue
      </button>
      {error ? <ErrorLine>{error}</ErrorLine> : null}
    </StepCard>
  );
}

function ListStep({ catalog }: { catalog: CatalogItem[] }) {
  const [items, setItems] = useState<InvItem[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selected, setSelected] = useState<InvItem | null>(null);
  const [price, setPrice] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [doneId, setDoneId] = useState<string | null>(null);

  const catalogByName = new Map(catalog.map((c) => [norm(c.name), c.id]));

  useEffect(() => {
    fetch("/api/market/inventory")
      .then(async (res) => {
        if (!res.ok) throw new Error((await res.json()).error ?? "Couldn't load inventory");
        return res.json();
      })
      .then((data: { items: InvItem[] }) => setItems(data.items))
      .catch((err: unknown) => setLoadError(err instanceof Error ? err.message : "Couldn't load inventory"));
  }, []);

  async function list() {
    if (!selected) return;
    const itemId = catalogByName.get(norm(selected.name));
    if (!itemId) {
      setError("That skin isn't tracked yet, so it can't be listed.");
      return;
    }
    const priceUsd = Number(price);
    if (!(priceUsd > 0)) {
      setError("Enter a price above $0.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/market/listings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          itemId,
          steamAssetId: selected.assetId,
          classId: selected.classId,
          instanceId: selected.instanceId,
          priceUsd,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not create listing");
      setDoneId(data.listing.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create listing");
    } finally {
      setBusy(false);
    }
  }

  if (doneId) {
    return (
      <StepCard step={3} title="Listed!" note="Your skin is now on the marketplace.">
        <div className="flex items-center gap-2 text-up">
          <CheckCircle2 className="h-5 w-5" /> <span className="font-medium">Live</span>
        </div>
        <div className="mt-4 flex gap-3">
          <Link href={`/market/${doneId}`} className="rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-white hover:opacity-90">
            View listing
          </Link>
          <Link href="/market" className="rounded-xl border border-line px-4 py-2 text-sm font-medium text-tx hover:border-accent/60">
            Back to market
          </Link>
        </div>
      </StepCard>
    );
  }

  return (
    <StepCard step={3} title="Pick a skin and set a price" note="Only tradable, tracked skins can be listed.">
      {loadError ? (
        <ErrorLine>{loadError}</ErrorLine>
      ) : items === null ? (
        <div className="flex items-center gap-2 text-sm text-mut">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading your inventory…
        </div>
      ) : items.length === 0 ? (
        <p className="text-sm text-mut">No tradable S&amp;box items found in your inventory.</p>
      ) : (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {items.map((it) => {
            const tracked = catalogByName.has(norm(it.name));
            const active = selected?.assetId === it.assetId;
            return (
              <button
                key={it.assetId}
                onClick={() => tracked && setSelected(it)}
                disabled={!tracked}
                title={tracked ? it.name : `${it.name} — not tracked yet`}
                className={`relative rounded-xl border p-2 text-left transition-colors ${
                  active ? "border-accent" : "border-line"
                } ${tracked ? "hover:border-accent/60" : "cursor-not-allowed opacity-40"}`}
              >
                {it.imageUrl ? (
                  <Image src={it.imageUrl} alt={it.name} width={80} height={80} className="mx-auto h-16 w-16 object-contain" unoptimized />
                ) : (
                  <div className="mx-auto h-16 w-16 rounded bg-panel2" />
                )}
                <div className="mt-1 truncate text-[11px] text-mut">{it.name}</div>
              </button>
            );
          })}
        </div>
      )}

      {selected ? (
        <div className="mt-5 flex items-end gap-3">
          <label className="flex-1">
            <span className="text-xs text-mut">Price (USD)</span>
            <div className="mt-1 flex items-center gap-2 rounded-xl border border-line bg-bg px-3 py-2 focus-within:border-accent">
              <Tag className="h-4 w-4 text-mut" />
              <input
                type="number"
                min="0"
                step="0.01"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="0.00"
                className="w-full bg-transparent font-mono text-tx outline-none"
              />
            </div>
          </label>
          <button
            onClick={list}
            disabled={busy}
            className="flex items-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            List for sale
          </button>
        </div>
      ) : null}
      {selected && Number.isFinite(Number(price)) && Number(price) > 0 ? (
        <p className="mt-2 text-xs text-mut">
          You&apos;ll receive{" "}
          <span className="font-mono text-tx">
            ${formatUsdc(splitFee(usdToUsdcBaseUnits(Number(price))).sellerAmount)}
          </span>{" "}
          after the marketplace fee.
        </p>
      ) : null}
      {error ? <ErrorLine>{error}</ErrorLine> : null}
    </StepCard>
  );
}

function StepCard({
  step,
  title,
  note,
  children,
}: {
  step: number;
  title: string;
  note: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-6 rounded-2xl border border-line bg-panel p-5">
      <div className="mb-4">
        <span className="text-xs font-medium text-accent">Step {step}</span>
        <h2 className="font-display text-lg font-semibold text-tx">{title}</h2>
        <p className="text-sm text-mut">{note}</p>
      </div>
      {children}
    </div>
  );
}
