export default function PlayerProfileLoading() {
  return (
    <div className="space-y-4" role="status" aria-label="Loading player profile">
      <div className="h-9 w-9 animate-pulse rounded-lg bg-white/[0.06]" />
      <section className="overflow-hidden rounded-xl border border-nrl-border bg-[#111832] p-3 sm:p-4">
        <div className="space-y-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="h-14 w-14 shrink-0 animate-pulse rounded-full bg-white/[0.06] sm:h-16 sm:w-16" />
            <div className="space-y-3">
              <div className="h-6 w-36 animate-pulse rounded bg-white/[0.06]" />
              <div className="h-3 w-28 animate-pulse rounded bg-white/[0.06]" />
            </div>
          </div>
          <div className="grid min-w-0 grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
            {Array.from({ length: 4 }, (_, index) => (
              <div key={index} className="space-y-2 rounded-lg border border-nrl-border bg-white/[0.035] px-3 py-2.5">
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
