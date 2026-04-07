"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";

export default function ItemsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="mx-auto max-w-2xl px-4 py-20 text-center">
      <div className="inline-flex p-3 rounded-full bg-red-500/10 mb-4">
        <AlertTriangle className="h-8 w-8 text-red-400" />
      </div>
      <h2 className="text-2xl font-bold text-white mb-2">Failed to load items</h2>
      <p className="text-neutral-500 mb-6">
        {error.message || "We couldn't load the items. Please try again."}
      </p>
      <div className="flex justify-center gap-3">
        <Button onClick={reset} className="bg-purple-600 hover:bg-purple-700 text-white">
          Try Again
        </Button>
        <Link href="/">
          <Button variant="outline">Go Home</Button>
        </Link>
      </div>
    </div>
  );
}
