export default function LineupsLoading() {
  return (
    <div className="space-y-8" role="status" aria-label="Loading team lists">
      <div className="grid grid-cols-3 gap-2 sm:ml-auto sm:max-w-md">
        {Array.from({ length: 3 }, (_, index) => (
          <div key={index} className="h-9 animate-pulse rounded-full border border-nrl-border bg-white/[0.06]" />
        ))}
      </div>
      {[1, 2].map((group) => (
        <section key={group} className="space-y-5">
          <div className="h-3 w-40 animate-pulse rounded bg-white/[0.06]" />
          {Array.from({ length: group === 1 ? 1 : 2 }, (_, cardIndex) => (
            <div key={cardIndex} className="relative overflow-hidden rounded-lg border border-nrl-border bg-nrl-panel px-4 pb-7 pt-3">
              <div className="mx-auto h-2 w-36 animate-pulse rounded bg-white/[0.08]" />
              <div className="mt-4 grid grid-cols-[1fr_auto_1fr] items-center gap-4">
                {[0, 1].map((teamIndex) => (
                  <div key={teamIndex} className={teamIndex === 1 ? "col-start-3 flex flex-col items-center gap-2" : "flex flex-col items-center gap-2"}>
                    <div className="h-11 w-11 animate-pulse rounded-full bg-white/[0.08]" />
                    <div className="h-3 w-20 animate-pulse rounded bg-white/[0.08]" />
                  </div>
                ))}
                <div className="col-start-2 row-start-1 h-5 w-14 animate-pulse rounded bg-white/[0.08]" />
              </div>
              <div className="absolute bottom-1 left-1/2 h-7 w-7 -translate-x-1/2 animate-pulse rounded-full border border-nrl-border bg-white/[0.06]" />
            </div>
          ))}
        </section>
      ))}
      <span className="sr-only">Loading team lists…</span>
    </div>
  )
}
