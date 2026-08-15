export default function PlayerProfileLoading() {
  return (
    <div className="space-y-4" role="status" aria-label="Loading player profile">
      <div className="h-5 w-32 animate-pulse rounded bg-white/[0.06]" />
      <section className="overflow-hidden rounded-xl border border-nrl-border bg-nrl-panel">
        <div className="grid grid-cols-[minmax(8.5rem,10.5rem)_minmax(0,1fr)] gap-4 bg-nrl-panel-2 p-4 md:grid-cols-[minmax(16rem,22rem)_minmax(0,1fr)]">
          <div className="flex min-w-0 flex-col gap-3 md:flex-row md:items-center md:gap-4">
            <div className="h-32 w-28 shrink-0 animate-pulse rounded-lg bg-white/[0.06] md:h-36 md:w-32" />
            <div className="space-y-3">
              <div className="h-6 w-36 animate-pulse rounded bg-white/[0.06]" />
              <div className="h-3 w-28 animate-pulse rounded bg-white/[0.06]" />
            </div>
          </div>
          <div className="grid min-w-0 grid-cols-2 content-start gap-2 xl:grid-cols-6">
            {Array.from({ length: 6 }, (_, index) => (
              <div key={index} className="space-y-2 rounded-md border border-nrl-border bg-nrl-panel px-3 py-2">
                <div className="h-2 w-14 animate-pulse rounded bg-white/[0.06]" />
                <div className="h-5 w-10 animate-pulse rounded bg-white/[0.06]" />
              </div>
            ))}
          </div>
        </div>
      </section>
      <section className="overflow-hidden rounded-xl border border-nrl-border bg-nrl-panel">
        <div className="h-10 border-b border-nrl-border bg-nrl-panel-2" />
        {Array.from({ length: 6 }, (_, index) => (
          <div key={index} className="flex h-12 items-center gap-5 border-b border-nrl-border/60 px-3 last:border-b-0">
            <div className="h-3 w-20 animate-pulse rounded bg-white/[0.06]" />
            <div className="h-3 w-16 animate-pulse rounded bg-white/[0.06]" />
            <div className="ml-auto h-3 w-12 animate-pulse rounded bg-white/[0.06]" />
          </div>
        ))}
      </section>
      <span className="sr-only">Loading player profile…</span>
    </div>
  )
}
