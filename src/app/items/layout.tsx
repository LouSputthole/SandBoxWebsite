import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Browse Skins - S&box Skins",
  description:
    "Browse, search, and filter all S&box (sbox/sandbox) skins on the Steam Community Market. Sort by price, type, and popularity.",
  alternates: { canonical: "/items" },
};

export default function ItemsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
