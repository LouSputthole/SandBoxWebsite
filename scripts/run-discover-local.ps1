# Local hourly runner for the sbox.dev discovery/enrichment pipeline.
#
# WHY local: Cloudflare 403s datacenter IPs. It blocked Vercel's ASN first, then
# (2026-06-26) GitHub Actions' ASN too — killing .github/workflows/enrich-sbox.yml.
# This residential IP still gets 200, so we run the same script from a Windows
# Scheduled Task ("sboxskins-discover-enrich", hourly) instead.
#
# Key: reads user env var SBOXSKINS_ADMIN_KEY (= the site's ANALYTICS_KEY), set
# once via setx. Output appended to scripts/discover-local.log (trimmed to 500 lines).
# Portable: repo = parent of this script's folder; node from PATH (fallback to default install).
$repo = Split-Path -Parent $PSScriptRoot
$log  = Join-Path $repo 'scripts\discover-local.log'
Set-Location $repo
$node = (Get-Command node -ErrorAction SilentlyContinue).Source
if (-not $node) { $node = 'C:\Program Files\nodejs\node.exe' }
$env:SITE_URL      = 'https://sboxskins.gg'
$env:SBOX_ANNOUNCE = 'true'
$ts = Get-Date -Format 'u'
try {
  $out = & $node scripts/discover-from-sbox.mjs 2>&1 | Out-String
  "$ts EXIT=$LASTEXITCODE  $out" | Add-Content $log
} catch {
  "$ts ERROR $_" | Add-Content $log
}
if (Test-Path $log) { (Get-Content $log -Tail 500) | Set-Content $log }
