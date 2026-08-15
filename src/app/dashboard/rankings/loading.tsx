export default function RankingsLoading() {
  return (
    <div className="space-y-4" role="status" aria-label="Loading rankings">
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-3">
        <div className="h-8 animate-pulse rounded-xl border border-nrl-border bg-nrl-panel-2" />
        <div className="h-8 animate-pulse rounded-xl border border-nrl-border bg-nrl-panel-2" />
      </div>
      <section className="overflow-hidden rounded-2xl border border-nrl-border bg-nrl-panel">
        <div className="flex gap-3 border-b border-nrl-border px-4 py-3">
          <div className="h-8 w-40 animate-pulse rounded-md bg-white/[0.06]" />
          <div className="h-8 w-40 animate-pulse rounded-md bg-white/[0.06]" />
          <div className="h-8 w-28 animate-pulse rounded-md bg-white/[0.06]" />
        </div>
        <div className="flex items-center justify-between border-b border-nrl-border px-4 py-3">
          <div className="h-4 w-52 animate-pulse rounded bg-white/[0.06]" />
          <div className="h-9 w-9 animate-pulse rounded-full bg-white/[0.06]" />
        </div>
        {Array.from({ length: 7 }, (_, index) => (
          <div key={index} className="flex h-14 items-center gap-3 border-b border-nrl-border/60 px-4 last:border-b-0">
            <div className="h-3 w-4 animate-pulse rounded bg-white/[0.06]" />
            <div className="h-10 w-10 shrink-0 animate-pulse rounded-full bg-white/[0.06]" />
            <div className="h-3 w-32 animate-pulse rounded bg-white/[0.06]" />
            <div className="ml-auto h-3 w-16 animate-pulse rounded bg-white/[0.06]" />
          </div>
        ))}
      </section>
      <span className="sr-only">Loading rankings…</span>
    </div>
  )
}
