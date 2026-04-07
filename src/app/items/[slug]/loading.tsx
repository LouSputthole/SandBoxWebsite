import { Skeleton } from "@/components/ui/skeleton";

export default function ItemDetailLoading() {
  return (
    <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-8">
      <Skeleton className="h-6 w-24 mb-8" />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <Skeleton className="h-80 rounded-xl" />
        <div className="space-y-4">
          <Skeleton className="h-8 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-12 w-1/3" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-10 w-48" />
        </div>
      </div>
      <Skeleton className="h-64 mt-8 rounded-xl" />
    </div>
  );
}
