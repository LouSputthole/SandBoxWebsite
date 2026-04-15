import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

/**
 * POST /api/admin/link-sbox
 *
 * For every item in the DB that doesn't have a sboxFullIdent yet, search the
 * Facepunch package API by title and store the matching FullIdent. This
 * powers the "View on sbox.game" link on item detail pages so we can send
 * users to the specific item page instead of the generic metrics page.
 *
 * Protected by CRON_SECRET header.
 */

interface FacepunchPackage {
  Title: string;
  Ident: string;
  FullIdent: string;
  TypeName: string;
  Org: { Ident: string };
}

interface FacepunchResponse {
  Packages?: FacepunchPackage[];
}

// Types we care about when matching — excludes gamemodes/addons/etc.
const VALID_TYPES = new Set(["clothing", "wearable", "model", "skin"]);

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/\s*\(.*?\)\s*/g, "")
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

async function searchFacepunch(query: string): Promise<FacepunchPackage[]> {
  const url = `https://services.facepunch.com/sbox/package/find?q=${encodeURIComponent(query)}&take=20`;
  const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
  if (!res.ok) return [];
  const data = (await res.json()) as FacepunchResponse;
  return data.Packages ?? [];
}

function pickBestMatch(itemName: string, packages: FacepunchPackage[]): FacepunchPackage | null {
  const target = normalize(itemName);
  if (!target) return null;

  // Filter to types that could be skins — excludes gamemodes/tools/etc.
  const candidates = packages.filter((p) =>
    VALID_TYPES.has(p.TypeName?.toLowerCase() ?? ""),
  );
  if (candidates.length === 0) return null;

  // 1. Exact title match (normalized)
  const exact = candidates.find((p) => normalize(p.Title) === target);
  if (exact) return exact;

  // 2. Contains match — pick shortest title that contains the target
  // (avoids matching "Hazmat Suit" to "Hazmatsuit [PLAYERMODEL]" when "Hazmat Suit" exists)
  const containing = candidates
    .filter((p) => normalize(p.Title).includes(target))
    .sort((a, b) => a.Title.length - b.Title.length);
  if (containing[0]) return containing[0];

  // 3. Target contains candidate — e.g., "Easter Bunny Hat 2026" might contain just "Easter Bunny Hat"
  const contained = candidates
    .filter((p) => target.includes(normalize(p.Title)) && normalize(p.Title).length >= 4)
    .sort((a, b) => b.Title.length - a.Title.length);
  if (contained[0]) return contained[0];

  return null;
}

export async function POST(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 });
  }
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const force = url.searchParams.get("force") === "true";

  const items = await prisma.item.findMany({
    where: force ? {} : { sboxFullIdent: null },
    select: { id: true, name: true, sboxFullIdent: true },
  });

  let matched = 0;
  let unmatched = 0;
  const matches: { name: string; fullIdent: string; type: string }[] = [];
  const unmatchedItems: string[] = [];

  for (const item of items) {
    try {
      const packages = await searchFacepunch(item.name);
      const best = pickBestMatch(item.name, packages);

      if (best) {
        await prisma.item.update({
          where: { id: item.id },
          data: { sboxFullIdent: best.FullIdent },
        });
        matched++;
        matches.push({ name: item.name, fullIdent: best.FullIdent, type: best.TypeName });
      } else {
        unmatched++;
        unmatchedItems.push(item.name);
      }
    } catch (err) {
      console.error(`[link-sbox] Failed for "${item.name}":`, err);
      unmatched++;
      unmatchedItems.push(item.name);
    }

    // Be polite to the Facepunch API
    await new Promise((r) => setTimeout(r, 250));
  }

  console.log(`[link-sbox] Matched ${matched}, unmatched ${unmatched} of ${items.length}`);

  return NextResponse.json({
    success: true,
    total: items.length,
    matched,
    unmatched,
    matches: matches.slice(0, 100),
    unmatchedItems,
  });
}
