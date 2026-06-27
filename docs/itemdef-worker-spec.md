# Spec — Headless Steamworks itemdef worker (first-party catalog, no sbox.dev)

**Status:** proposed (2026-06-26)
**Goal:** Pull the full s&box (appid **590830**) item-definition catalog **directly from Steam**
via Steamworks, and feed it into sboxskins.gg's existing enrich endpoint — removing the
dependency on sbox.dev (and therefore on Cloudflare and on a residential-IP scheduled task).

## Why this, and why it's the only first-party path

Established by investigation 2026-06-26:
- s&box skins **are Steam Inventory Service items** (`ISteamInventory`, appid 590830) — confirmed
  from `Sandbox.*` assembly types (`InventoryDef/InventoryItem/InventoryResult/...`) and live
  `SteamAPI_Init ... AppID 590830`.
- The **Steam Community Market** is anonymous but only lists **tradeable items with active
  listings**: `total_count = 128`, render caps ~10/call and rate-limits. Our catalog is already
  **141** items, a superset of the Market — the Market can't be the source.
- The **full itemdef catalog** (incl. unlisted drops + static props) is what sbox.dev relays. It's
  reachable first-party only through Steamworks: `ISteamInventory::LoadItemDefinitions()` +
  `GetItemDefinitionIDs()` + `GetItemDefinitionProperty()`. The anonymous
  `GetItemDefArchive` needs a `digest` that is never exposed/ logged/ cached readably (checked).

So: run a tiny Steamworks process ourselves = exactly what sbox.dev does, minus the middleman.

## Mechanism

Use **Facepunch.Steamworks** (NuGet, Facepunch's own C# wrapper — natural fit):

```
SteamClient.Init( 590830 );                 // needs a logged-in Steam session (see Runtime)
await SteamInventory.WaitForDefinitions();   // triggers LoadItemDefinitions + waits
foreach ( var def in SteamInventory.Definitions )
{
    def.Id; def.Name; def.Description;
    def.GetProperty("<key>");                // supply, rarity, tradable, store flags, etc.
    // def.Properties to enumerate ALL keys (do this in Phase 0 to learn the schema)
}
SteamClient.Shutdown();
```

(Method names approximate — pin them against the installed Facepunch.Steamworks version in Phase 0.)

## Runtime / auth requirements

- A **Steam account that "owns" s&box** (it's free — any account that has it in its library).
  No purchases needed; itemdefs are the catalog, readable by anyone running the app.
- A `steam_appid.txt` containing `590830` next to the worker exe so `SteamClient.Init` works
  without launching through Steam.
- **The Steam client must be running + logged in** on the worker box (Facepunch.Steamworks uses
  the live session). This is the one wrinkle vs a pure HTTP fetch.
  - **De-risk in Phase 0:** test whether a **dedicated-server context** (`SteamServer.Init`,
    anonymous GSLT) can read itemdefs *without* a user login. If yes → truly headless, no Steam
    client, can run on any always-on box. If no → run a dedicated Steam account's client in the
    background (e.g. the same always-on PC that will host the discovery task).

## Data flow

```
[worker] Steamworks itemdef catalog (appid 590830)
   → map InventoryDef → enrich payload (slug, name, totalSupply, isDroppableItem,
      rarity/rarityColor, releasePrice, isActiveStoreItem, ...)
   → POST https://sboxskins.gg/api/admin/enrich-items   (Bearer SBOXSKINS_ADMIN_KEY)
        → seedItemFromSboxPayload: creates unknown rows, updates known, busts Redis cache
```

Reuse the **existing** `POST /api/admin/enrich-items` if the itemdef→payload mapping can match the
shape `seedItemFromSboxPayload` expects. If the field set differs enough, add a thin
`POST /api/admin/enrich-from-steam` that maps the Steam itemdef shape and then calls the same
`seedItemFromSboxPayload`/`computeScarcityScore` internals. **Slug:** derive the same way the
Steam-Market path does so rows dedupe against existing items (reuse `SLUG_OVERRIDES`).

## What it does and does NOT provide

- ✅ Full **catalog** (every defid, incl. unlisted drops) + **static props** (name, description,
  rarity, supply rules, tradable/marketable, store flags, release info — whatever Facepunch sets).
- ❌ **Live unique-owner counts and current prices** are NOT in itemdefs. Those stay sourced from
  the **Steam Community Market** sync we already run (current split — just minus sbox.dev for the
  catalog half). Confirm in Phase 0 which numeric props itemdefs actually carry (supply may be there).

## Build plan

- **Phase 0 — spike (highest value, ~1–2 h):** C# console + Facepunch.Steamworks, `Init(590830)`,
  load definitions, **dump every defid + every property to a JSON file**. Deliverable: that dump +
  a side-by-side vs one sbox.dev payload → answers (a) can we read itemdefs at all / with which auth
  context, (b) exactly which fields we get, (c) coverage vs sbox.dev. **Do not build further until
  this dump exists.**
- **Phase 1 — pipe:** map dump → enrich payload, POST to the site (reuse or add the endpoint),
  verify rows create/update + cache bust + a new-drop tweet enqueues.
- **Phase 2 — operate:** schedule it (same Scheduled-Task pattern as `run-discover-local.ps1`, or a
  Windows service if using the dedicated-server context). Keep the sbox.dev local task as a
  **fallback** until the worker has run clean for a week, then retire it.

## Open questions (resolve in Phase 0)

1. Can `SteamServer.Init` (anonymous) read itemdefs, or is a user login required? (decides "truly
   headless" vs "Steam client must run logged in")
2. Which numeric/economy props are in the itemdef vs only on the Market? (supply? owners? price?)
3. Does the itemdef shape map cleanly onto `seedItemFromSboxPayload`, or do we need the thin
   `enrich-from-steam` adapter endpoint?
4. Property key names Facepunch uses (rarity, store, drop, supply) — from the Phase 0 dump.

## Risks

- Steamworks coupling (needs Steam running unless server context works) — main operational cost.
- ToS: reading itemdefs via Steamworks is legitimate API use (the client does it every launch); low
  risk, much less grey than scraping.
- If itemdefs lack supply/owners, this replaces *discovery + static catalog* only — acceptable, the
  Market sync covers the dynamic numbers and that's already independent of sbox.dev.
```
```

## Bottom line

This is the kill-shot for sbox.dev independence on the **catalog** half: a small C# console using
Facepunch.Steamworks, gated by a 1–2 h Phase-0 spike that proves feasibility and reveals the exact
field coverage before any real build.
