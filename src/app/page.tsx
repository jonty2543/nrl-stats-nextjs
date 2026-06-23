import Image from "next/image"
import Link from "next/link"
import type { CSSProperties } from "react"
import { LandingHeroScrollShell } from "@/components/views/landing-hero-scroll-shell"
import { AppHeader } from "@/components/layout/app-header"

export const dynamic = "force-static"

function heroPlayerImageMaskStyle(mobile = false): CSSProperties {
  const mask = mobile
    ? "radial-gradient(102% 112% at 50% 88%, rgba(0,0,0,1) 0%, rgba(0,0,0,0.98) 42%, rgba(0,0,0,0.9) 58%, rgba(0,0,0,0.52) 72%, rgba(0,0,0,0.18) 84%, transparent 94%)"
    : "radial-gradient(108% 116% at 50% 88%, rgba(0,0,0,1) 0%, rgba(0,0,0,0.98) 44%, rgba(0,0,0,0.9) 60%, rgba(0,0,0,0.54) 74%, rgba(0,0,0,0.18) 86%, transparent 95%)"

  return {
    WebkitMaskImage: mask,
    maskImage: mask,
  }
}

function LiveBroadcastIcon({ className = "h-3.5 w-3.5" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 20 20"
      aria-hidden="true"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
    >
      <circle cx="10" cy="10" r="1.7" fill="currentColor" stroke="none" />
      <path d="M6.7 6.8a4.7 4.7 0 0 0 0 6.4" />
      <path d="M13.3 6.8a4.7 4.7 0 0 1 0 6.4" />
      <path d="M4.1 4.4a8.1 8.1 0 0 0 0 11.2" />
      <path d="M15.9 4.4a8.1 8.1 0 0 1 0 11.2" />
    </svg>
  )
}

function SectionEyebrow({ children }: { children: React.ReactNode }) {
  return <div className="text-[10px] font-semibold uppercase tracking-[0.24em] text-emerald-300">{children}</div>
}

function FeatureSection({
  eyebrow,
  title,
  description,
  bullets,
  ctaHref,
  ctaLabel,
  live = false,
  children,
}: {
  eyebrow: string
  title: string
  description: string
  bullets: string[]
  ctaHref: string
  ctaLabel: string
  live?: boolean
  children?: React.ReactNode
}) {
  return (
    <section className="flex h-full flex-col border border-white/8 bg-[linear-gradient(180deg,rgba(16,20,42,0.92),rgba(11,14,29,0.92))] p-5 sm:p-7 lg:p-8">
      <div className="flex min-w-0 flex-1 flex-col px-1 sm:px-2">
        <div className="flex flex-wrap items-center gap-3">
          <SectionEyebrow>{eyebrow}</SectionEyebrow>
          {live ? (
            <span className="inline-flex items-center gap-2 rounded-full border border-emerald-400/18 bg-emerald-400/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-300">
              <LiveBroadcastIcon />
              Live
            </span>
          ) : null}
        </div>
        <h3 className="mt-3 text-xl font-bold text-white sm:text-2xl">{title}</h3>
        <div className="mt-4 grid gap-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(16rem,0.85fr)] lg:items-start">
          <p className="max-w-2xl text-sm leading-6 text-white/58 sm:leading-7">{description}</p>
          <div className="grid gap-x-5 gap-y-2 md:grid-cols-2">
            {bullets.map((bullet) => (
              <div key={bullet} className="flex items-center gap-2 text-sm text-white/78">
                <span className="h-1.5 w-1.5 rounded-full bg-nrl-accent" />
                <span>{bullet}</span>
              </div>
            ))}
          </div>
        </div>
        <Link
          href={ctaHref}
          className="mt-5 inline-flex w-fit items-center gap-2 rounded-full border border-white/12 bg-white/5 px-4 py-2 text-sm font-semibold text-white/85 transition-colors hover:border-white/22 hover:text-white sm:mt-6 lg:mt-auto lg:translate-y-3"
        >
          {ctaLabel}
          <span aria-hidden="true">→</span>
        </Link>
      </div>
      {children ? <div className="h-full min-w-0 px-1 sm:px-2">{children}</div> : null}
    </section>
  )
}

export default function Home() {
  return (
    <div className="relative overflow-x-clip text-nrl-text">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />

      <div className="relative mx-auto flex min-h-screen w-full max-w-7xl flex-col px-4 pb-16 sm:px-6 lg:px-8">
        <AppHeader sticky showBillingNav showStatsTabs className="-mx-4 sm:-mx-6 lg:-mx-8" />

        <LandingHeroScrollShell>
          <section className="-mx-4 grid gap-6 px-4 pb-0 pt-8 sm:-mx-6 sm:gap-8 sm:px-6 sm:pb-12 sm:pt-10 lg:-mx-8 lg:mt-6 lg:grid-cols-[1.02fr_0.98fr] lg:items-center lg:px-8 lg:pb-0 lg:pt-14">
            <div className="max-w-2xl lg:pb-10">
              <div className="inline-flex items-center rounded-full border border-emerald-400/15 bg-emerald-400/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.24em] text-emerald-300">
                NRL Analysis Platform
              </div>
              <h1 className="mt-5 pb-2 text-[2.85rem] font-black leading-[0.98] tracking-tight text-white sm:text-6xl">
                Smarter Analysis for
                {" "}
                <span className="bg-[linear-gradient(135deg,#ffffff_0%,#ae94ff_44%,#53ffd0_100%)] bg-clip-text text-transparent">
                  Rugby League
                </span>
              </h1>
              <p className="mt-4 max-w-xl text-sm leading-6 text-white/62 sm:text-base sm:leading-7">
                Short Side combines the tools every fantasy player and bettor needs to see the game from a data driven perspective.
              </p>

              <div className="relative mt-6 flex items-end justify-center lg:hidden">
                <div className="relative flex h-[15.5rem] w-full max-w-[26rem] items-end justify-center overflow-hidden px-1 pt-3">
                  <Image
                    src="/nrl_players-removebg-preview.png"
                    alt="NRL players"
                    width={666}
                    height={375}
                    priority
                    className="relative z-10 h-auto w-[126%] max-w-none translate-x-2 object-contain object-bottom"
                    style={heroPlayerImageMaskStyle(true)}
                  />
                </div>
              </div>
            </div>

            <div className="relative hidden lg:flex lg:items-end lg:justify-center lg:self-end">
              <div className="relative flex h-[17.25rem] w-full max-w-[31.75rem] items-end justify-center overflow-visible px-1 pt-3">
                <Image
                  src="/nrl_players-removebg-preview.png"
                  alt="NRL players"
                  width={666}
                  height={375}
                  priority
                  className="relative z-10 h-auto w-[146%] max-w-none translate-x-4 object-contain object-bottom"
                  style={heroPlayerImageMaskStyle()}
                />
              </div>
            </div>
          </section>
        </LandingHeroScrollShell>


        <section className="space-y-6 border-t border-white/8 px-4 py-10 sm:px-6 lg:px-8">
          <div className="px-1 sm:px-2">
            <SectionEyebrow>Built For Weekly Decisions</SectionEyebrow>
            <h2 className="mt-2 text-2xl font-bold text-white">What does Short Side offer?</h2>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            {[
              {
                eyebrow: "Fantasy",
                title: "See top movers, player game logs and more",
                description: "Use Fantasy to see player stats, info and game logs, and upgrade to pro to see projections, breakevens, and our unique Trade Ratings",
                bullets: ["Five-star trade rating system", "Full game logs and filters", "Projections, breakevens, plots", "Draft / H2H odds tools"],
                ctaHref: "/dashboard/fantasy",
                ctaLabel: "Fantasy",
              },
              {
                eyebrow: "Lineups",
                title: "Team lists with lane insights, matchup history, and try scorer prices",
                description: "Use Lineups after teams are named to check who has been named, compare left, middle, and right scoring lanes, and check the AI generated match insights",
                bullets: ["Interactive field view", "Left / middle / right insights", "Scored vs conceded lane chart", "AI Generated match insights"],
                ctaHref: "/dashboard/lineups",
                ctaLabel: "Lineups",
              },
              {
                eyebrow: "Betting",
                title: "Best bets, model edge, odds comparison, and tracker tools",
                description: "Betting uses our Machine Learning models along with market context to find the best bets across H2H, Line, Total and Tryscorer markets",
                bullets: ["Today's Best Bets", "Tryscorer odds and player form", "Odds comparison across 5 bookmakers", "Personal bet tracker and staking calculator"],
                ctaHref: "/dashboard/betting",
                ctaLabel: "Betting",
              },
              {
                eyebrow: "Articles",
                title: "Explaining the method behind the madness",
                description: "We use articles to give clarity on our process for fantasy projections and betting models, as well as to provide general insights using data driven analysis",
                bullets: ["Machine learning walkthroughs", "Public article submission"],
                ctaHref: "/dashboard/articles",
                ctaLabel: "Articles",
              },
              {
                eyebrow: "Stats",
                title: "Player stats, Team stats, Player archetypes",
                description: "Use the stats section to compare players and teams directly, inspect plot comparisons, profile archetypes, and see stat leaders across seasons.",
                bullets: ["Player archetype profiles", "Player comparison and filtered charts", "Percentile ranks and recent form", "Season leader cards"],
                ctaHref: "/dashboard/stats-hub",
                ctaLabel: "Stats",
              },
              {
                eyebrow: "NRL AI",
                title: "A personal AI that knows every NRL stat at your fingertips",
                description: "Ask NRL AI for rankings, player trends, betting context, and follow-up questions across our vast NRL dataset.",
                bullets: ["Player and team stat queries", "Fantasy screenshot analysis", "Follow-up questions in context", "Betting market summaries"],
                ctaHref: "/dashboard/ai",
                ctaLabel: "NRL AI",
              },
            ].map((feature) => (
              <FeatureSection key={feature.eyebrow} {...feature} />
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}
