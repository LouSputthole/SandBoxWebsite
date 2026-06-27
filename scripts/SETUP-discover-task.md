# Set up the hourly sbox.dev discovery task on a (new) machine

**Why this is a local task and not CI:** Cloudflare 403s datacenter IPs. It blocked
Vercel's ASN first, then (2026-06-26) GitHub Actions' ASN too. So `discover-from-sbox.mjs`
must run from a **residential IP**. Pick a PC that is **on most of the time**
(an always-on home machine is ideal — the task only runs while that PC is powered on).

The GitHub Action `.github/workflows/enrich-sbox.yml` is **disabled** so it can't double-run.
Don't re-enable it unless Cloudflare ever unblocks GitHub (`gh workflow enable enrich-sbox.yml`).

This task does **discovery + sbox.dev metadata only** (new drops, supply, owners, scarcity,
rarity, store flags). Live market **pricing is a separate Steam sync on Vercel** — unaffected.

---

## 1. Prereqs
- **Node.js** installed and on PATH (`node -v` works).
- This repo cloned somewhere on the machine.

## 2. Provide the admin key (one time)
The script needs `SBOXSKINS_ADMIN_KEY` = the site's **`ANALYTICS_KEY`**.
Get the value from Vercel → project **`sand-box-website-112`** → Settings → Environment
Variables → `ANALYTICS_KEY` (or `vercel env pull` and read it). Then, in PowerShell:

```powershell
setx SBOXSKINS_ADMIN_KEY "<paste-the-ANALYTICS_KEY-value>"
```

Open a **new** PowerShell window afterward so the variable is in scope.

## 3. Confirm this machine's IP isn't blocked
```powershell
curl.exe -s -o NUL -w "%{http_code}`n" https://sbox.dev/sitemap-skins.xml   # expect 200
```
If it prints **403**, this network's IP is also blocked — use a different (residential) network.

## 4. Smoke-test the script (no key needed)
From the repo root:
```powershell
node scripts/discover-from-sbox.mjs --dry-run    # expect: "DRY RUN — nothing posted." + exit 0
```

## 5. Register the hourly task

**Recommended — HIDDEN (no popup window). Run in an ELEVATED (Admin) PowerShell, from the repo root:**
```powershell
$name = 'sboxskins-discover-enrich'
$w = (Resolve-Path .\scripts\run-discover-local.ps1).Path
$action  = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$w`""
$trigger = New-ScheduledTaskTrigger -Once -At ([datetime]::Today) -RepetitionInterval (New-TimeSpan -Hours 1)
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -Hidden -ExecutionTimeLimit (New-TimeSpan -Minutes 20)
$principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType S4U -RunLevel Limited
Register-ScheduledTask -TaskName $name -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Force
Start-ScheduledTask -TaskName $name
```
S4U = runs hidden in the background even when the screen is locked (PC just has to be on).
**This requires admin** — that's the only reason it failed on the original PC (non-elevated shell).

**Fallback — SIMPLE (no admin, but a PowerShell window pops up each hour):**
```powershell
$name = 'sboxskins-discover-enrich'
$w = (Resolve-Path .\scripts\run-discover-local.ps1).Path
$action  = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$w`""
$trigger = New-ScheduledTaskTrigger -Once -At ([datetime]::Today) -RepetitionInterval (New-TimeSpan -Hours 1)
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Minutes 20)
Register-ScheduledTask -TaskName $name -Action $action -Trigger $trigger -Settings $settings -Force
Start-ScheduledTask -TaskName $name
```

## 6. Verify it worked
```powershell
Get-Content .\scripts\discover-local.log -Tail 3     # expect a line ending "EXIT=0 ... enriched N"
```

---

## Manage / remove
```powershell
Get-ScheduledTask  sboxskins-discover-enrich          # state
Start-ScheduledTask sboxskins-discover-enrich          # run now
Get-Content .\scripts\discover-local.log -Tail 20      # last runs
Unregister-ScheduledTask -TaskName sboxskins-discover-enrich -Confirm:$false   # remove
```

The wrapper (`scripts/run-discover-local.ps1`) is path-portable: it derives the repo from its
own location and finds `node` on PATH, so no edits are needed per machine.
