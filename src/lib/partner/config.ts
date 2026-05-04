/**
 * Single source of truth for the S&box Trading Hub partnership.
 * Every surface that mentions the partner (footer, banner, nav,
 * blog post, newsletter section) reads from this file. When the
 * partner sends final brand assets + Discord URL, swap the
 * placeholders below and every consumer updates in one go.
 *
 * Phase A landing checklist (parallel to the partner's own work):
 *   - PARTNER.url         → DONE: permanent Discord invite supplied
 *   - PARTNER.logoSrc     → drop their PNG/SVG into /public/partners/
 *                           and update the path
 *   - PARTNER.brandColor  → their accent hex if they want our
 *                           callouts in their color
 *
 * `enabled` is the single kill switch — flip it to false to hide
 * every partner surface site-wide (useful if the relationship
 * ever needs to be paused without code changes).
 */
export interface PartnerConfig {
  enabled: boolean;
  /** Display name in copy. */
  name: string;
  /** Short handle for tighter contexts (nav link, badges). */
  shortName: string;
  /** Public landing URL. The Hub's Discord invite is the most
   *  natural target since their community lives there. Update to
   *  whatever they prefer for inbound traffic. */
  url: string;
  /** Logo path relative to /public. Add the file at
   *  public/partners/<file> and reference it here. */
  logoSrc: string;
  /** Image alt text for the logo. */
  logoAlt: string;
  /** Accent color (hex with #). Used for borders + small accents
   *  on partner surfaces. Defaults to our purple if they don't
   *  supply one. */
  brandColor: string;
  /** Slug of the launch-announcement blog post — used by the
   *  homepage announcement banner. */
  launchPostSlug: string;
}

export const PARTNER: PartnerConfig = {
  enabled: true,
  name: "S&box Trading Hub",
  shortName: "Trading Hub",
  // Permanent (non-expiring) Discord invite supplied by the Hub.
  // The UTM params let us measure outbound traffic from each
  // surface (footer, banner, nav, blog, newsletter, listing CTA).
  url: "https://discord.gg/XeUYHQDXt6",
  logoSrc: "/partners/trading-hub.svg",
  logoAlt: "S&box Trading Hub",
  brandColor: "#8b5cf6",
  launchPostSlug: "trading-hub-partnership",
};

/**
 * Build a UTM-tagged outbound URL for the partner. Each surface
 * supplies its own `medium` so we can attribute click-through by
 * placement (footer / banner / nav / blog / newsletter).
 */
export function partnerUrl(medium: string): string {
  if (!PARTNER.enabled) return "/";
  const sep = PARTNER.url.includes("?") ? "&" : "?";
  return `${PARTNER.url}${sep}utm_source=sboxskins&utm_medium=${encodeURIComponent(
    medium,
  )}&utm_campaign=hub_partner`;
}
