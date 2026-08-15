export default function PlayersLoading() {
  return (
    <div className="space-y-4" role="status" aria-label="Loading player statistics">
      <section className="overflow-hidden rounded-2xl border border-nrl-border/90 bg-nrl-panel">
        <div className="flex min-h-[44px] items-center gap-3 border-b border-nrl-border/70 bg-nrl-panel-2 px-5 py-2">
          <div className="h-7 w-24 animate-pulse rounded-full bg-white/[0.06]" />
          <div className="h-7 w-32 animate-pulse rounded-md bg-white/[0.06]" />
          <div className="h-9 min-w-28 max-w-xs flex-1 animate-pulse rounded-md bg-white/[0.06]" />
          <div className="ml-auto h-9 w-9 animate-pulse rounded-full bg-white/[0.06]" />
        </div>
        <div className="overflow-hidden">
          <div className="flex h-10 items-center gap-6 border-b border-nrl-border/70 px-3">
            <div className="h-3 w-28 animate-pulse rounded bg-white/[0.06]" />
            <div className="h-3 w-20 animate-pulse rounded bg-white/[0.06]" />
            <div className="ml-auto h-3 w-16 animate-pulse rounded bg-white/[0.06]" />
          </div>
          {Array.from({ length: 7 }, (_, index) => (
            <div key={index} className="flex h-16 items-center gap-3 border-b border-nrl-border/60 px-3 last:border-b-0">
              <div className="h-10 w-10 shrink-0 animate-pulse rounded-full bg-white/[0.06]" />
              <div className="h-3 w-32 animate-pulse rounded bg-white/[0.06]" />
              <div className="ml-auto h-3 w-16 animate-pulse rounded bg-white/[0.06]" />
            </div>
          ))}
        </div>
      </section>
      <span className="sr-only">Loading player statistics…</span>
    </div>
  )
}
