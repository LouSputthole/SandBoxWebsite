export default function ItemsLoading() {
  return (
    <div className="mx-auto max-w-[1240px] px-6 py-8">
      {/* Header */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="h-9 w-64 animate-pulse rounded-lg bg-[var(--bg2)]" />
          <div className="mt-3 h-4 w-80 animate-pulse rounded bg-[var(--bg2)]" />
        </div>
        <div className="h-10 w-full animate-pulse rounded-xl bg-[var(--bg2)] sm:w-[280px]" />
      </div>

      {/* Toolbar chips */}
      <div className="mb-6 flex flex-wrap gap-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-8 w-24 animate-pulse rounded-[11px] bg-[var(--bg2)]" />
        ))}
      </div>

      {/* Grid */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        {Array.from({ length: 20 }).map((_, i) => (
          <div
            key={i}
            className="rounded-[18px] border border-[var(--line)] bg-[var(--panel)] p-3"
          >
            <div className="mb-3 aspect-square w-full animate-pulse rounded-[14px] bg-[var(--bg2)]" />
            <div className="mb-2 h-4 w-3/4 animate-pulse rounded bg-[var(--bg2)]" />
            <div className="mb-3 h-3 w-1/2 animate-pulse rounded bg-[var(--bg2)]" />
            <div className="h-5 w-1/3 animate-pulse rounded bg-[var(--bg2)]" />
          </div>
        ))}
      </div>
    </div>
  );
}
