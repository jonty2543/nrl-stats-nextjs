import type { ReactNode } from "react"

function Pulse({ className }: { className: string }) {
  return <div className={`animate-pulse bg-white/[0.06] ${className}`} />
}

function LoadingPage({ label, children, className = "space-y-4" }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={className} role="status" aria-label={label}>
      {children}
      <span className="sr-only">{label}…</span>
    </div>
  )
}

function TableRows({ count = 7, logos = true }: { count?: number; logos?: boolean }) {
  return Array.from({ length: count }, (_, index) => (
    <div key={index} className="flex h-14 items-center gap-3 border-b border-nrl-border/60 px-4 last:border-b-0">
      {logos ? <Pulse className="h-10 w-10 shrink-0 rounded-full" /> : null}
      <div className="space-y-2">
        <Pulse className="h-3 w-32 rounded" />
        <Pulse className="h-2 w-20 rounded" />
      </div>
      <Pulse className="ml-auto h-3 w-16 rounded" />
    </div>
  ))
}

export function AboutPageSkeleton() {
  return (
    <LoadingPage label="Loading about page">
      <section className="rounded-xl border border-nrl-border bg-nrl-panel p-6">
        <div className="max-w-3xl space-y-3">
          <Pulse className="h-4 w-80 max-w-full rounded" />
          <Pulse className="h-4 w-full rounded" />
          <Pulse className="h-4 w-[92%] rounded" />
          <Pulse className="h-4 w-[96%] rounded" />
          <Pulse className="h-4 w-2/3 rounded" />
          <div className="flex gap-3 pt-2">
            <Pulse className="h-9 w-28 rounded-md" />
            <Pulse className="h-9 w-20 rounded-md" />
          </div>
        </div>
      </section>
    </LoadingPage>
  )
}

export function AiPageSkeleton() {
  return (
    <LoadingPage label="Loading NRL AI" className="relative left-1/2 -mb-[5.25rem] -ml-[50vw] -mt-2 h-[calc(100dvh-2.75rem)] min-h-[30rem] w-screen overflow-hidden border-t border-nrl-border sm:-mb-[5.5rem] sm:-mt-3 lg:-mb-24 lg:-mt-4">
      <div className="mx-auto flex h-full w-[calc(100%_-_2rem)] max-w-[76rem] flex-col sm:w-[calc(100%_-_3rem)] lg:w-[calc(100%_-_4rem)]">
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-nrl-border px-4 sm:px-5">
          <Pulse className="h-5 w-24 rounded" />
          <Pulse className="h-3 w-28 rounded" />
        </header>
        <div className="flex flex-1 -translate-y-12 flex-col items-center justify-center text-center">
          <Pulse className="h-9 w-72 max-w-[80%] rounded" />
          <Pulse className="mt-4 h-3 w-96 max-w-[70%] rounded" />
          <Pulse className="mt-2 h-3 w-64 max-w-[60%] rounded" />
        </div>
        <div className="mx-auto mb-6 w-full max-w-3xl px-4 sm:px-6">
          <div className="flex h-16 items-center gap-3 rounded-[1.75rem] border border-nrl-border bg-nrl-panel p-2 shadow-2xl shadow-black/30">
            <Pulse className="h-10 w-10 shrink-0 rounded-full" />
            <Pulse className="h-4 flex-1 rounded" />
            <Pulse className="h-10 w-10 shrink-0 rounded-full" />
          </div>
        </div>
      </div>
    </LoadingPage>
  )
}

export function ArchetypesPageSkeleton() {
  return (
    <LoadingPage label="Loading player archetypes">
      <section className="min-h-[720px] bg-[#111733]">
        <div className="flex gap-3 border-b border-nrl-border p-4">
          <Pulse className="h-9 w-36 rounded-md" />
          <Pulse className="h-9 w-36 rounded-md" />
          <Pulse className="ml-auto h-9 w-48 rounded-md" />
        </div>
        <div className="grid gap-3 p-4 sm:grid-cols-3">
          {Array.from({ length: 3 }, (_, index) => (
            <div key={index} className="space-y-3 rounded-xl border border-nrl-border bg-nrl-panel p-4">
              <Pulse className="h-3 w-24 rounded" />
              <Pulse className="h-7 w-20 rounded" />
            </div>
          ))}
        </div>
        <div className="mx-4 h-[470px] rounded-xl border border-nrl-border bg-nrl-panel p-6">
          <div className="flex h-full items-end justify-around gap-3 border-b border-l border-nrl-border/60 px-5 pt-10">
            {[42, 68, 54, 82, 61, 74, 48, 88].map((height, index) => (
              <Pulse key={index} className="h-full w-8 rounded-t sm:w-12" />
            )).map((bar, index) => (
              <div key={index} className="flex h-full items-end" style={{ height: `${[42, 68, 54, 82, 61, 74, 48, 88][index]}%` }}>{bar}</div>
            ))}
          </div>
        </div>
      </section>
    </LoadingPage>
  )
}

export function ArticlesPageSkeleton() {
  return (
    <LoadingPage label="Loading articles" className="space-y-8">
      <div className="flex items-center justify-between">
        <Pulse className="h-8 w-40 rounded" />
        <Pulse className="h-10 w-10 rounded-full" />
      </div>
      <div className="grid items-stretch gap-5 xl:grid-cols-2">
        {Array.from({ length: 4 }, (_, index) => (
          <article key={index} className="overflow-hidden rounded-lg border border-nrl-border bg-nrl-panel">
            <Pulse className="h-44 w-full" />
            <div className="space-y-3 p-4">
              <Pulse className="h-3 w-28 rounded" />
              <Pulse className="h-6 w-3/4 rounded" />
              <Pulse className="h-3 w-full rounded" />
              <Pulse className="h-3 w-4/5 rounded" />
            </div>
          </article>
        ))}
      </div>
    </LoadingPage>
  )
}

export function ArticlePageSkeleton() {
  return (
    <LoadingPage label="Loading article" className="mx-auto w-full max-w-6xl space-y-5">
      <Pulse className="h-5 w-32 rounded" />
      <article className="overflow-hidden rounded-lg border border-nrl-border bg-nrl-panel">
        <Pulse className="h-52 w-full sm:h-72 lg:h-80" />
        <div className="space-y-5 p-4 sm:p-6 lg:p-8">
          <div className="flex items-center gap-2">
            <Pulse className="h-6 w-6 rounded-full" />
            <Pulse className="h-3 w-40 rounded" />
          </div>
          <Pulse className="h-8 w-3/4 rounded" />
          <div className="space-y-3 pt-2">
            {["w-full", "w-[95%]", "w-full", "w-[88%]", "w-[92%]", "w-2/3"].map((width, index) => (
              <Pulse key={index} className={`h-3 rounded ${width}`} />
            ))}
          </div>
        </div>
      </article>
    </LoadingPage>
  )
}

export function BettingPageSkeleton() {
  return (
    <LoadingPage label="Loading betting dashboard" className="space-y-6">
      <Pulse className="h-9 w-9 rounded-full" />

      <section className="overflow-hidden rounded-xl border border-nrl-border bg-nrl-panel">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-nrl-border px-4 py-3">
          <Pulse className="h-3 w-20 rounded" />
          <div className="flex gap-2">
            <Pulse className="h-8 w-28 rounded-md" />
            <Pulse className="h-8 w-24 rounded-md" />
          </div>
        </div>
        <div className="flex gap-2 overflow-hidden border-b border-nrl-border px-4 py-3">
          {[28, 16, 14, 16, 18].map((width, index) => (
            <div key={index} className="shrink-0" style={{ width: `${width}%` }}>
              <Pulse className="h-8 w-full rounded-md" />
            </div>
          ))}
        </div>
        <div className="space-y-4 p-4">
          <div className="flex items-center justify-between">
            <Pulse className="h-3 w-16 rounded" />
            <Pulse className="h-2 w-20 rounded" />
          </div>
          <div className="rounded-lg border border-nrl-border bg-nrl-panel-2 p-3">
            <Pulse className="h-2 w-32 rounded" />
            <div className="mt-3 flex items-center gap-3">
              <Pulse className="h-10 w-10 rounded-full" />
              <Pulse className="h-5 w-64 max-w-[65%] rounded" />
            </div>
            <Pulse className="mt-2 h-3 w-56 max-w-[60%] rounded" />
            <div className="mt-4 flex items-end justify-between border-t border-nrl-border pt-3">
              <div className="space-y-2"><Pulse className="h-2 w-16 rounded" /><Pulse className="h-5 w-20 rounded" /><Pulse className="h-2 w-28 rounded" /></div>
              <div className="space-y-2 rounded-xl border border-nrl-border p-3"><Pulse className="h-5 w-24 rounded" /><Pulse className="h-2 w-20 rounded" /></div>
            </div>
          </div>
          <div className="flex items-center justify-between pt-2"><Pulse className="h-3 w-24 rounded" /><Pulse className="h-2 w-16 rounded" /></div>
          <Pulse className="h-11 w-full rounded-lg border border-nrl-border" />
        </div>
      </section>

      <section className="rounded-xl border border-nrl-border bg-nrl-panel p-4">
        <Pulse className="h-3 w-40 rounded" />
        <div className="mt-4 space-y-2">
          {Array.from({ length: 3 }, (_, index) => (
            <Pulse key={index} className="h-9 w-full rounded-md border border-nrl-border" />
          ))}
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2">
          {Array.from({ length: 2 }, (_, index) => (
            <div key={index} className="space-y-2"><Pulse className="h-2 w-16 rounded" /><Pulse className="h-9 w-full rounded-md border border-nrl-border" /></div>
          ))}
        </div>
      </section>

      <div className="flex gap-2 overflow-hidden rounded-xl border border-nrl-border bg-nrl-panel p-2">
        {Array.from({ length: 5 }, (_, index) => (
          <Pulse key={index} className="h-9 min-w-20 flex-1 rounded-md" />
        ))}
      </div>
    </LoadingPage>
  )
}

export function BillingPageSkeleton() {
  return (
    <LoadingPage label="Loading billing plans">
      <section className="rounded-[28px] border border-nrl-border bg-nrl-panel px-3 py-8 sm:px-5 sm:py-10">
        <div className="mx-auto max-w-7xl">
          <Pulse className="mx-auto h-7 w-24 rounded-full" />
          <div className="mx-auto mt-8 grid max-w-md grid-cols-1 gap-4 lg:max-w-none lg:grid-cols-3 lg:gap-6">
            {Array.from({ length: 3 }, (_, index) => (
              <article key={index} className="flex min-h-[440px] flex-col items-center rounded-[24px] border border-nrl-border bg-nrl-panel-2 p-6">
                <Pulse className="h-6 w-28 rounded-full" />
                <Pulse className="mt-5 h-8 w-24 rounded" />
                <Pulse className="mt-5 h-14 w-32 rounded" />
                <div className="mt-8 w-full space-y-4">
                  {Array.from({ length: 5 }, (_, itemIndex) => (
                    <div key={itemIndex} className="flex items-center gap-3">
                      <Pulse className="h-5 w-5 shrink-0 rounded-full" />
                      <Pulse className="h-3 flex-1 rounded" />
                    </div>
                  ))}
                </div>
                <Pulse className="mt-auto h-11 w-full rounded-xl" />
              </article>
            ))}
          </div>
        </div>
      </section>
    </LoadingPage>
  )
}

export function BillingReturnPageSkeleton() {
  return (
    <LoadingPage label="Restoring billing session" className="mx-auto max-w-xl">
      <div className="rounded-2xl border border-nrl-border bg-nrl-panel p-6 text-center">
        <Pulse className="mx-auto h-4 w-44 rounded" />
        <Pulse className="mx-auto mt-3 h-3 w-64 max-w-full rounded" />
      </div>
    </LoadingPage>
  )
}

export function FantasyOverviewPageSkeleton() {
  return (
    <LoadingPage label="Loading fantasy dashboard">
      <Pulse className="h-9 w-9 rounded-full" />
      <section className="overflow-hidden rounded-xl border border-white/10 bg-nrl-panel">
        <div className="border-b border-nrl-border px-4 py-3"><Pulse className="h-3 w-24 rounded" /></div>
        {TableRows({ count: 5 })}
      </section>
      <div className="grid gap-3 md:grid-cols-3">
        {Array.from({ length: 3 }, (_, index) => (
          <div key={index} className="space-y-3 rounded-xl border border-nrl-border bg-nrl-panel p-4">
            <Pulse className="h-4 w-28 rounded" />
            <Pulse className="h-16 w-full rounded-lg" />
            <Pulse className="h-8 w-24 rounded-md" />
          </div>
        ))}
      </div>
    </LoadingPage>
  )
}

export function FantasyAnalyticsPageSkeleton() {
  return (
    <LoadingPage label="Loading fantasy analytics">
      <div className="flex items-center gap-3">
        <Pulse className="h-9 w-32 rounded-full" />
        <Pulse className="h-9 w-36 rounded-md" />
        <Pulse className="ml-auto h-9 w-9 rounded-full" />
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {Array.from({ length: 3 }, (_, index) => (
          <div key={index} className="space-y-3 rounded-xl border border-nrl-border bg-nrl-panel p-4">
            <Pulse className="h-3 w-24 rounded" />
            <Pulse className="h-7 w-16 rounded" />
          </div>
        ))}
      </div>
      <section className="overflow-hidden rounded-xl border border-nrl-border bg-nrl-panel">
        <div className="flex items-center justify-between border-b border-nrl-border bg-nrl-panel-2 px-4 py-3">
          <Pulse className="h-4 w-40 rounded" />
          <Pulse className="h-8 w-24 rounded-full" />
        </div>
        {TableRows({ count: 7 })}
      </section>
    </LoadingPage>
  )
}

export function FantasyDraftPageSkeleton() {
  return (
    <LoadingPage label="Loading fantasy draft tool">
      <Pulse className="h-9 w-10 rounded-md" />
      <section className="rounded-xl border border-nrl-border bg-nrl-panel p-3 md:p-4">
        <div className="flex flex-wrap items-center gap-3 border-b border-nrl-border pb-3">
          <Pulse className="h-4 w-52 rounded" />
          <Pulse className="h-8 w-28 rounded-full" />
          <Pulse className="ml-auto h-9 w-32 rounded-md" />
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {Array.from({ length: 2 }, (_, sideIndex) => (
            <div key={sideIndex} className="overflow-hidden rounded-xl border border-nrl-border bg-nrl-panel-2/40">
              <div className="flex items-center gap-3 border-b border-nrl-border p-3">
                <Pulse className="h-12 w-12 rounded-full" />
                <Pulse className="h-4 w-32 rounded" />
              </div>
              {Array.from({ length: 7 }, (_, rowIndex) => (
                <div key={rowIndex} className="flex h-12 items-center gap-3 border-b border-nrl-border/60 px-3 last:border-b-0">
                  <Pulse className="h-3 w-8 rounded" />
                  <Pulse className="h-8 w-8 rounded-full" />
                  <Pulse className="h-3 w-28 rounded" />
                  <Pulse className="ml-auto h-3 w-12 rounded" />
                </div>
              ))}
            </div>
          ))}
        </div>
      </section>
    </LoadingPage>
  )
}

export function MyTeamPageSkeleton() {
  return (
    <LoadingPage label="Loading your fantasy team">
      <div className="flex items-center justify-between">
        <Pulse className="h-9 w-10 rounded-md" />
        <Pulse className="h-8 w-28 rounded-md" />
      </div>
      <section className="overflow-hidden rounded-xl border border-nrl-border bg-nrl-panel">
        <div className="flex items-center justify-between border-b border-nrl-border bg-nrl-panel-2 p-4">
          <div className="space-y-2"><Pulse className="h-5 w-40 rounded" /><Pulse className="h-3 w-28 rounded" /></div>
          <Pulse className="h-12 w-12 rounded-full" />
        </div>
        <div className="grid gap-3 bg-[linear-gradient(180deg,rgba(16,185,129,0.08),transparent)] p-4 sm:grid-cols-2">
          {Array.from({ length: 10 }, (_, index) => (
            <div key={index} className="flex h-14 items-center gap-3 rounded-lg border border-nrl-border bg-nrl-panel-2/80 px-3">
              <Pulse className="h-10 w-10 rounded-full" />
              <div className="space-y-2"><Pulse className="h-3 w-28 rounded" /><Pulse className="h-2 w-16 rounded" /></div>
              <Pulse className="ml-auto h-3 w-12 rounded" />
            </div>
          ))}
        </div>
      </section>
    </LoadingPage>
  )
}

export function PlotsPageSkeleton() {
  return (
    <LoadingPage label="Loading stats plot">
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-3">
        <Pulse className="h-8 rounded-xl border border-nrl-border" />
        <Pulse className="h-8 rounded-xl border border-nrl-border" />
      </div>
      <section className="overflow-hidden rounded-2xl border border-nrl-border bg-nrl-panel">
        <div className="flex gap-3 border-b border-nrl-border px-4 py-3">
          <Pulse className="h-8 w-36 rounded-md" />
          <Pulse className="h-8 w-32 rounded-md" />
          <Pulse className="h-8 w-24 rounded-md" />
        </div>
        <div className="flex items-center justify-between border-b border-nrl-border px-4 py-3">
          <Pulse className="h-4 w-52 rounded" />
          <Pulse className="h-9 w-9 rounded-full" />
        </div>
        <div className="relative aspect-[45/22] min-h-[360px] p-8">
          <div className="absolute inset-8 border-b border-l border-nrl-border/70" />
          {[[18,72],[31,43],[44,64],[53,30],[66,55],[73,76],[84,40],[91,61]].map(([left, top], index) => (
            <div key={index} className="absolute" style={{ left: `${left}%`, top: `${top}%` }}>
              <Pulse className="h-6 w-6 rounded-full" />
            </div>
          ))}
        </div>
      </section>
    </LoadingPage>
  )
}

export function TeamsPageSkeleton() {
  return (
    <LoadingPage label="Loading team statistics">
      <section className="overflow-hidden rounded-2xl border border-nrl-border bg-nrl-panel">
        <div className="flex items-center gap-3 border-b border-nrl-border bg-nrl-panel-2 px-4 py-3">
          <Pulse className="h-8 w-24 rounded-full" />
          <Pulse className="h-8 w-36 rounded-md" />
          <Pulse className="ml-auto h-9 w-9 rounded-full" />
        </div>
        <div className="flex h-10 items-center gap-8 border-b border-nrl-border px-4">
          <Pulse className="h-3 w-28 rounded" />
          <Pulse className="h-3 w-20 rounded" />
          <Pulse className="ml-auto h-3 w-16 rounded" />
        </div>
        {TableRows({ count: 6 })}
      </section>
      <section className="rounded-md border border-nrl-border bg-nrl-panel p-3">
        <div className="flex items-center justify-between"><Pulse className="h-4 w-36 rounded" /><Pulse className="h-9 w-9 rounded-full" /></div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2"><Pulse className="h-36 rounded-lg" /><Pulse className="h-36 rounded-lg" /></div>
      </section>
    </LoadingPage>
  )
}
