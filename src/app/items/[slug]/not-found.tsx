import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function ItemNotFound() {
  return (
    <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-20 text-center">
      <h1 className="text-2xl font-bold text-white mb-2">Item Not Found</h1>
      <p className="text-neutral-500 mb-6">
        The item you&apos;re looking for doesn&apos;t exist or has been removed.
      </p>
      <Link href="/items">
        <Button variant="outline">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Browse
        </Button>
      </Link>
    </div>
  );
}
