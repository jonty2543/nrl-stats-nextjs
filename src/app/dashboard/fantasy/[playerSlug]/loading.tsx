export default function FantasyPlayerLoading() {
  return (
    <div className="space-y-4" role="status" aria-label="Loading fantasy player">
      <div className="h-5 w-44 animate-pulse rounded bg-white/[0.06]" />

      <section className="overflow-hidden rounded-xl border border-nrl-border bg-nrl-panel">
        <div className="grid gap-5 bg-nrl-panel-2 p-4 sm:grid-cols-[10rem_minmax(0,1fr)]">
          <div className="h-44 w-full animate-pulse rounded-lg bg-white/[0.06] sm:h-48" />
          <div className="min-w-0 space-y-5 py-1">
            <div className="space-y-3">
              <div className="h-7 w-48 animate-pulse rounded bg-white/[0.06]" />
              <div className="flex gap-2">
                <div className="h-6 w-20 animate-pulse rounded-md bg-white/[0.06]" />
                <div className="h-6 w-24 animate-pulse rounded-md bg-white/[0.06]" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
              {Array.from({ length: 4 }, (_, index) => (
                <div key={index} className="space-y-2 rounded-md border border-nrl-border bg-nrl-panel px-3 py-3">
                  <div className="h-2 w-14 animate-pulse rounded bg-white/[0.06]" />
                  <div className="h-5 w-16 animate-pulse rounded bg-white/[0.06]" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-xl border border-nrl-border bg-nrl-panel">
        <div className="flex items-center justify-between border-b border-nrl-border bg-nrl-panel-2 px-4 py-3">
          <div className="h-4 w-36 animate-pulse rounded bg-white/[0.06]" />
          <div className="h-7 w-20 animate-pulse rounded-full bg-white/[0.06]" />
        </div>
        {Array.from({ length: 6 }, (_, index) => (
          <div key={index} className="flex h-12 items-center gap-4 border-b border-nrl-border/60 px-4 last:border-b-0">
            <div className="h-3 w-24 animate-pulse rounded bg-white/[0.06]" />
            <div className="h-3 w-16 animate-pulse rounded bg-white/[0.06]" />
            <div className="ml-auto h-3 w-12 animate-pulse rounded bg-white/[0.06]" />
          </div>
        ))}
      </section>
      <span className="sr-only">Loading fantasy player…</span>
    </div>
  )
}
