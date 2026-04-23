import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { inferItemType } from "@/lib/services/sync-service";
import { guardAdminRoute } from "@/lib/auth/admin-guard";

/**
 * POST /api/admin/reclassify — Re-run type inference on all existing items.
 *
 * Useful after improving the inferItemType logic. Iterates every item, computes
 * a new type from its name, and updates if different. Returns a report of changes.
 *
 * Gated by CRON_SECRET with per-IP brute-force rate limiting.
 */
export async function POST(request: NextRequest) {
  const guard = await guardAdminRoute(request, { allowedKeys: ["cron"] });
  if (!guard.ok) return guard.response;

  const items = await prisma.item.findMany({
    select: { id: true, name: true, type: true },
  });

  const changes: { id: string; name: string; from: string; to: string }[] = [];

  // We don't have the original Steam type string stored — use the name only.
  // inferItemType accepts empty steamType.
  for (const item of items) {
    const newType = inferItemType("", item.name);
    if (newType !== item.type) {
      changes.push({ id: item.id, name: item.name, from: item.type, to: newType });
    }
  }

  // Run all updates in parallel instead of serially
  await Promise.all(
    changes.map((c) =>
      prisma.item.update({ where: { id: c.id }, data: { type: c.to } }),
    ),
  );

  const updated = changes.length;

  // Group changes by type for the report
  const byNewType: Record<string, string[]> = {};
  for (const c of changes) {
    (byNewType[c.to] ??= []).push(`${c.name} (was ${c.from})`);
  }

  console.log(`[reclassify] Updated ${updated} of ${items.length} items`);

  return NextResponse.json({
    success: true,
    total: items.length,
    updated,
    unchanged: items.length - updated,
    changes: byNewType,
  });
}
