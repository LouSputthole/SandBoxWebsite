import type { Metadata } from "next";
import { PortfolioView } from "@/components/portfolio/portfolio-view";

export const metadata: Metadata = {
  title: "Watchlist - S&box Skins",
  description:
    "Track your favorite S&box skins. Monitor prices, 24h changes, and total portfolio value.",
};

export default function PortfolioPage() {
  return <PortfolioView />;
}
