import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/auth/session";
import { DeleteAccountPanel } from "./delete-account-panel";

export const metadata: Metadata = {
  title: "Account settings",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function AccountSettingsPage() {
  const current = await getCurrentSession();
  if (!current) {
    redirect("/api/auth/steam?next=/account/settings");
  }

  return (
    <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-10">
      <div className="mb-6">
        <Link
          href="/"
          className="text-xs text-neutral-500 hover:text-white transition-colors"
        >
          ← Home
        </Link>
        <h1 className="text-2xl font-bold text-white mt-2">Account settings</h1>
        <p className="text-sm text-neutral-500 mt-1">
          Manage your account. Looking for active sessions and login history?{" "}
          <Link href="/account/sessions" className="text-purple-300 hover:text-purple-200 underline">
            Account security
          </Link>
          .
        </p>
      </div>

      <DeleteAccountPanel />
    </div>
  );
}
