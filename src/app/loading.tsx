import { Skeleton } from "@/components/ui/skeleton";

export default function HomeLoading() {
  return (
    <div>
      {/* Hero skeleton */}
      <section className="border-b border-neutral-800">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-20 sm:py-28 text-center">
          <Skeleton className="h-8 w-64 mx-auto mb-6" />
          <Skeleton className="h-14 w-96 mx-auto mb-4" />
          <Skeleton className="h-6 w-80 mx-auto mb-8" />
          <div className="flex justify-center gap-4">
            <Skeleton className="h-12 w-40" />
            <Skeleton className="h-12 w-32" />
          </div>
        </div>
      </section>
      {/* Stats skeleton */}
      <section className="border-b border-neutral-800 bg-neutral-900/30">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6">
          <div className="grid grid-cols-3 gap-6">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-16" />
            ))}
          </div>
        </div>
      </section>
      {/* Items skeleton */}
      <section className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-12">
        <Skeleton className="h-8 w-48 mb-6" />
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-neutral-800 p-4">
              <Skeleton className="h-32 w-full mb-4 rounded-lg" />
              <Skeleton className="h-4 w-3/4 mb-2" />
              <Skeleton className="h-6 w-1/2" />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
