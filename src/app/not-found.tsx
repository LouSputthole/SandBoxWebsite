import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Home } from "lucide-react";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-20 text-center">
      <p className="text-8xl font-bold text-neutral-800 mb-4">404</p>
      <h1 className="text-2xl font-bold text-white mb-2">Page Not Found</h1>
      <p className="text-neutral-500 mb-6">
        The page you&apos;re looking for doesn&apos;t exist.
      </p>
      <Link href="/">
        <Button className="gap-2 bg-purple-600 hover:bg-purple-700 text-white">
          <Home className="h-4 w-4" />
          Go Home
        </Button>
      </Link>
    </div>
  );
}
