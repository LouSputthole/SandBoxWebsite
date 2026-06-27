# itemdef-worker — headless Steam itemdef enrichment

Pulls the s&box (Steam appid **590830**) item-definition catalog directly from
Steam via **SteamKit2** (no Steam client needed) and POSTs the itemdef-sourced
fields (`rarity`, `rarityColor`, `itemDefinitionId`, name for new items) to
`/api/admin/enrich-from-steam`. Runs in GitHub Actions — Steam isn't behind
Cloudflare, so a runner IP works fine.

It does **not** touch supply / owners / live price — those stay owned by the
Steam Market sync. Headline win: the 7-tier rarity (`common`…`mythic`) that the
Market never exposes.

## One-time setup (run the login step from any PC, once)

1. **Make a dedicated Steam account** (don't reuse your main — its refresh token
   will live in GitHub secrets). Add **s&box** to its library (it's free):
   https://store.steampowered.com/app/590830 → Play Game (installs nothing needed,
   just owning it in the library is enough).

2. **Mint a refresh token** — from this folder:
   ```
   dotnet run -- login
   ```
   Enter the dedicated account's name + password, complete Steam Guard. It prints:
   ```
   STEAM_ACCOUNT        = <name>
   STEAM_REFRESH_TOKEN  = <long token>
   ```
   The refresh token is long-lived (~months) and IP-independent — you only redo
   this when it eventually expires.

3. **Add three repo secrets** (Settings → Secrets and variables → Actions):
   - `STEAM_ACCOUNT` = the printed account name
   - `STEAM_REFRESH_TOKEN` = the printed token
   - `SBOXSKINS_ADMIN_KEY` = the site's `ANALYTICS_KEY` (already set if the
     `enrich-sbox` action exists — reuse it)

4. **Run it**: Actions → **itemdef-steam** → *Run workflow*. Check the log for
   `POST … -> 200` and `updated`/`created` counts. The 35 rarities + tier labels
   then show on the site.

5. **Schedule it** (optional, after the first green run): add to
   `.github/workflows/itemdef-steam.yml`:
   ```yaml
   on:
     schedule:
       - cron: "0 6 * * *"   # daily; rarity is near-static so daily is plenty
     workflow_dispatch:
   ```

## Local CI-mode run (for debugging)

```
STEAM_ACCOUNT=... STEAM_REFRESH_TOKEN=... SBOXSKINS_ADMIN_KEY=... dotnet run
```

## Notes / open runtime questions (validated on first real run)

- `Inventory.GetItemDefMeta(appid)` must return a `digest` for a regular (non-
  publisher) account — the Steam client does this every launch, so it should, but
  it's the one thing only a live login can confirm.
- The archive is fetched anonymously from
  `IGameInventory/GetItemDefArchive/v1/?appid=590830&digest=<digest>`. If its
  shape isn't a bare JSON array, the worker prints the first 200 chars so the
  parser can be adjusted.
