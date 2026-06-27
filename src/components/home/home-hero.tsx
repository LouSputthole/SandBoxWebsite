import Link from "next/link";
import { ArrowRight, Flame } from "lucide-react";
import { SkinTile } from "@/components/items/skin-tile";
import { Button } from "@/components/ui/button";
import { Price } from "@/components/ui/price";
import { rarityCssColor, rarityLabel } from "@/lib/rarity";
import { formatPriceChange } from "@/lib/utils";
import type { HomeItem } from "./types";

interface HomeHeroProps {
  /** The day's biggest mover, rendered as the featured card. */
  featured?: HomeItem;
  /** Count for the eyebrow + body copy. */
  trackedCount: number;
}

/**
 * Arcade hero: animated glow blobs, an entrance-fade eyebrow + H1 + CTAs on
 * the left, and a featured "Mover of the day" card (SkinTile + mono price +
 * delta, gentle float) on the right. All motion is CSS (animate-blob /
 * animate-pop-up / animate-floaty) and disabled under reduced-motion.
 */
export function HomeHero({ featured, trackedCount }: HomeHeroProps) {
  const rc = featured ? rarityCssColor(featured.rarityColor) : null;
  const tint = rc ?? "var(--rarity-legendary)";
  const rLabel = featured ? rarityLabel(featured.rarityColor) : null;
  const change = featured?.priceChange24h ?? null;
  const up = (change ?? 0) >= 0;

  return (
    <section className="relative overflow-hidden">
      {/* Animated glow blobs */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
        <div
          className="absolute h-[460px] w-[460px] animate-blob rounded-full"
          style={{
            top: -120,
            right: "6%",
            background:
              "radial-gradient(circle, rgba(199,125,255,.30), transparent 62%)",
            filter: "blur(50px)",
          }}
        />
        <div
          className="absolute h-[380px] w-[380px] animate-blob rounded-full"
          style={{
            top: 60,
            right: "32%",
            background:
              "radial-gradient(circle, rgba(217,70,239,.26), transparent 62%)",
            filter: "blur(54px)",
            animationDirection: "reverse",
          }}
        />
        <div
          className="absolute h-[340px] w-[340px] animate-blob rounded-full"
          style={{
            top: -60,
            left: -40,
            background:
              "radial-gradient(circle, rgba(90,169,255,.20), transparent 62%)",
            filter: "blur(54px)",
          }}
        />
      </div>

      <div className="relative mx-auto grid max-w-[1240px] grid-cols-1 items-center gap-12 px-6 pb-11 pt-14 lg:grid-cols-[1fr_.82fr]">
        {/* Left: copy + CTAs */}
        <div>
          <div className="mb-[22px] inline-flex animate-pop-up items-center gap-3 [animation-delay:.02s]">
            <span className="font-display text-[13px] font-extrabold uppercase tracking-[1.6px] text-accent">
              The S&box skin index
            </span>
            <span className="h-0.5 w-7 rounded-sm bg-accent opacity-45" />
            <span className="whitespace-nowrap text-[13.5px] font-medium text-mut">
              {trackedCount} skins, repriced every 15 min
            </span>
          </div>

          <h1 className="mb-5 animate-pop-up font-display text-[clamp(44px,5.4vw,72px)] font-extrabold leading-[.96] tracking-[-.02em] text-tx [animation-delay:.08s]">
            Collect &amp; trade
            <br />
            every <span className="text-tx">S&box skin</span>.
          </h1>

          <p className="mb-7 max-w-[460px] animate-pop-up text-[17px] leading-[1.55] text-mut [animation-delay:.14s]">
            Live prices, fresh drops, and the rarest cosmetics in the game — all{" "}
            {trackedCount} sbox skins, tracked in real time. Find your next flex.
          </p>

          <div className="flex animate-pop-up flex-wrap gap-3 [animation-delay:.2s]">
            <Link href="/items">
              <Button size="lg" className="gap-2">
                Browse all skins
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
            <Link href="#hot">
              <Button variant="secondary" size="lg">
                See what&apos;s hot
              </Button>
            </Link>
          </div>
        </div>

        {/* Right: featured "Mover of the day" card */}
        {featured && (
          <div
            className="relative animate-pop-up rounded-[24px] p-[1.5px] [animation-delay:.16s]"
            style={{
              background: `linear-gradient(150deg, color-mix(in srgb, ${tint} 70%, transparent), transparent 55%)`,
            }}
          >
            <div
              className="absolute -inset-[26px] z-0"
              aria-hidden
              style={{
                background: `radial-gradient(circle at 50% 38%, color-mix(in srgb, ${tint} 40%, transparent), transparent 64%)`,
                filter: "blur(34px)",
              }}
            />
            <div className="relative z-[1] rounded-[23px] border border-line bg-gradient-to-b from-panel to-panel2 p-[18px]">
              <div className="mb-3.5 flex items-center justify-between">
                <span className="inline-flex items-center gap-1.5 text-[13px] font-bold text-accent">
                  <Flame className="h-[15px] w-[15px]" fill="currentColor" />
                  Mover of the day
                </span>
                {change != null && (
                  <span
                    className="rounded-[8px] px-2 py-1 font-mono text-[13px] font-bold"
                    style={{
                      color: up ? "var(--up)" : "var(--down)",
                      background: up
                        ? "color-mix(in srgb, var(--up) 16%, transparent)"
                        : "color-mix(in srgb, var(--down) 16%, transparent)",
                    }}
                  >
                    {up ? "▲" : "▼"} {formatPriceChange(change)}
                  </span>
                )}
              </div>

              <SkinTile
                imageUrl={featured.imageUrl}
                name={featured.name}
                type={featured.type}
                rarityColor={rc}
                iconSize="lg"
                className="animate-floaty"
                badge={
                  rLabel ? (
                    <span
                      className="rounded-[8px] border px-2.5 py-1 text-[11px] font-bold uppercase tracking-[.4px] backdrop-blur"
                      style={{
                        color: tint,
                        background: "rgba(14,13,19,.7)",
                        borderColor: `color-mix(in srgb, ${tint} 40%, transparent)`,
                      }}
                    >
                      {rLabel}
                    </span>
                  ) : undefined
                }
              />

              <div className="mt-4 flex items-end justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate font-display text-[21px] font-bold tracking-[-.3px] text-tx">
                    {featured.name}
                  </div>
                  <div className="text-[13px] capitalize text-mut">
                    {featured.type}
                    {featured.volume != null && (
                      <> · {featured.volume.toLocaleString()} listed</>
                    )}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="font-mono text-[24px] font-bold text-tx">
                    {featured.currentPrice != null ? (
                      <Price amount={featured.currentPrice} />
                    ) : (
                      <span className="text-faint">N/A</span>
                    )}
                  </div>
                  <Link
                    href={`/items/${featured.slug}`}
                    className="text-[13px] font-semibold text-accent hover:underline"
                  >
                    View skin →
                  </Link>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
