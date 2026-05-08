import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { guardAdminRoute } from "@/lib/auth/admin-guard";
import { slugify } from "@/lib/utils";

/**
 * POST /api/admin/relabel-item
 *
 * Body: { id: string, name?: string, slug?: string }
 *
 * Surgical rename for a single Item row. Used to undo a wrong
 * orphan/phantom merge where the surviving row ended up with the
 * orphan's name/slug but the phantom's Steam data — e.g. the
 * "Brown Leather Coat" row that got merged with Steam's "Leather
 * Coat" and now needs to look like a Leather Coat row instead.
 *
 * Validates uniqueness on slug since it's @unique on Item. If
 * `slug` isn't provided but `name` is, derives the slug from the
 * new name. Pass `slug` explicitly when you want a different
 * URL than slugify(name) produces.
 *
 * Does NOT touch sbox.dev metadata — to refresh description,
 * image, supply, etc. for the new identity, follow up with a
 * call to /api/admin/seed-item passing the new slug.
 *
 * Protected by CRON_SECRET / ANALYTICS_KEY admin guard.
 */
export async function POST(request: NextRequest) {
  const guard = await guardAdminRoute(request, {
    allowedKeys: ["cron", "analytics"],
  });
  if (!guard.ok) return guard.response;

  let body: { id?: string; name?: string; slug?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  const id = body.id?.trim();
  if (!id) {
    return NextResponse.json(
      { error: "id is required" },
      { status: 400 },
    );
  }
  const newName = body.name?.trim();
  let newSlug = body.slug?.trim();
  if (!newName && !newSlug) {
    return NextResponse.json(
      { error: "provide name and/or slug to update" },
      { status: 400 },
    );
  }
  if (newName && !newSlug) {
    newSlug = slugify(newName);
  }
  if (newSlug && !/^[a-z0-9-]+$/.test(newSlug)) {
    return NextResponse.json(
      {
        error:
          "slug must be kebab-case (lowercase letters, digits, hyphens only)",
      },
      { status: 400 },
    );
  }

  const existing = await prisma.item.findUnique({
    where: { id },
    select: { id: true, name: true, slug: true },
  });
  if (!existing) {
    return NextResponse.json(
      { error: "no item with that id" },
      { status: 404 },
    );
  }

  // Refuse if a different row already owns the target slug.
  if (newSlug && newSlug !== existing.slug) {
    const slugClash = await prisma.item.findUnique({
      where: { slug: newSlug },
      select: { id: true, name: true },
    });
    if (slugClash && slugClash.id !== id) {
      return NextResponse.json(
        {
          error: `slug "${newSlug}" is already used by item "${slugClash.name}" (${slugClash.id})`,
        },
        { status: 409 },
      );
    }
  }

  const updated = await prisma.item.update({
    where: { id },
    data: {
      ...(newName ? { name: newName } : {}),
      ...(newSlug ? { slug: newSlug } : {}),
    },
    select: { id: true, name: true, slug: true },
  });

  return NextResponse.json({
    success: true,
    before: { name: existing.name, slug: existing.slug },
    after: { name: updated.name, slug: updated.slug },
    hint:
      "If you also want fresh sbox.dev metadata (image, description, supply) for the new identity, POST /api/admin/seed-item with the new slug.",
  });
}
