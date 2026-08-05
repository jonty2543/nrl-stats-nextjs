export default function FantasyPlayersLoading() {
  return (
    <div className="space-y-3" aria-label="Loading all fantasy players" aria-live="polite">
      <div className="h-9 w-44 animate-pulse rounded-full border border-nrl-border bg-nrl-panel-2" />
      <section className="overflow-hidden rounded-xl border border-nrl-border bg-nrl-panel">
        <div className="flex items-center justify-between border-b border-nrl-border bg-nrl-panel-2 px-3 py-2">
          <div className="h-7 w-48 animate-pulse rounded-full bg-white/[0.06]" />
          <div className="h-7 w-20 animate-pulse rounded-full bg-white/[0.06]" />
        </div>
        <div className="space-y-px">
          {Array.from({ length: 10 }, (_, index) => (
            <div
              key={index}
              className="flex h-14 items-center gap-3 border-b border-nrl-border/60 px-3 last:border-b-0"
            >
              <div className="h-10 w-10 shrink-0 animate-pulse rounded-full bg-white/[0.06]" />
              <div className="h-3 w-28 animate-pulse rounded bg-white/[0.06]" />
              <div className="ml-auto h-3 w-16 animate-pulse rounded bg-white/[0.06]" />
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
