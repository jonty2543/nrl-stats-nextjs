import Image from "next/image"
import Link from "next/link"
import { ImageWithFallback } from "@/components/ui/image-with-fallback"
import { LandingCarousel } from "@/components/views/landing-carousel"
import { LandingHeroScrollShell } from "@/components/views/landing-hero-scroll-shell"
import { PlayerImageCard } from "@/components/views/player-comparison"
import { LandingSuiteTabs } from "@/components/views/landing-suite-tabs"
import type { BettingOddsRow, BettingOddsSnapshot } from "@/lib/betting/types"
import { BETTING_BOOKIE_COLUMNS } from "@/lib/betting/types"
import type { Draw2026Data } from "@/lib/draw/types"
import { loadDraw2026Data } from "@/lib/draw/load-draw-2026"
import {
  fetchFantasyPlayersSnapshot,
  fetchLatestFantasyOwnershipBaselineSnapshot,
  type FantasyOwnershipBaselineSnapshot,
  type FantasyPlayerSnapshot,
} from "@/lib/fantasy/nrl"
import type { PlayerStat } from "@/lib/data/types"
import type { PlayerImageRecord } from "@/lib/supabase/queries"
import {
  fetchAvailableYears,
  fetchBettingOddsSnapshot,
  fetchFantasyPlayerStatsAllYears,
  fetchPlayerImages,
} from "@/lib/supabase/queries"

const BOOKIE_LOGOS: Record<string, string> = {
  Sportsbet: "/logos/sportsbet.png",
  Pointsbet: "/logos/pointsbet.png",
  Unibet: "/logos/unibet.png",
  Palmerbet: "/logos/palmerbet.png",
  Betright: "/logos/betright.png",
}

interface FantasyWeeklyRow {
  id: number
  name: string
  positionLabel: string
  ownedBy: number | null
  weeklyDelta: number | null
  avgPoints: number | null
}

interface BettingMatchPreview {
  dateLabel: string
  match: string
  rows: BettingOddsRow[]
}

interface DrawPreviewRow {
  round: number
  opponent: string | null
  opponentLogoUrl: string | null
  isHome: boolean
}

interface BoxSummaryRow {
  label: string
  count: number
  low: number
  q1: number
  median: number
  q3: number
  high: number
}

interface HeatmapRow {
  label: string
  cells: Array<{ opponent: string; average: number | null; count: number }>
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null
  if (typeof value === "string") {
    const trimmed = value.trim().replace(/,/g, "")
    if (!trimmed) return null
    const parsed = Number(trimmed)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function formatPercent(value: number | null, digits = 2): string {
  if (value == null || !Number.isFinite(value)) return "-"
  return `${value.toFixed(digits)}%`
}

function formatSignedPercent(value: number | null, digits = 2): string {
  if (value == null || !Number.isFinite(value)) return "-"
  const sign = value > 0 ? "+" : ""
  return `${sign}${value.toFixed(digits)}%`
}

function formatNumber(value: number | null, digits = 1): string {
  if (value == null || !Number.isFinite(value)) return "-"
  return value.toFixed(digits)
}

function formatCurrency(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return "-"
  return `$${Math.round(value).toLocaleString()}`
}

function formatShortDate(value: string): string {
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  return new Intl.DateTimeFormat("en-AU", {
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(parsed)
}

function normalisePersonName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim()
}

function normaliseTeamKey(value: string | null | undefined): string {
  return String(value ?? "")
    .replace(/-/g, " ")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
}

function parsePersonName(value: string): { first: string; last: string } {
  const parts = normalisePersonName(value).split(" ").filter(Boolean)
  if (parts.length === 0) return { first: "", last: "" }
  return { first: parts[0], last: parts[parts.length - 1] }
}

function normaliseRemoteImageCandidates(value: string | null | undefined): string[] {
  if (!value || typeof value !== "string") return []
  const trimmed = value.trim()
  if (!trimmed) return []

  const out: string[] = []
  const seen = new Set<string>()
  const push = (candidate: string | null | undefined) => {
    if (!candidate) return
    const normalised = candidate.trim()
    if (!normalised || seen.has(normalised)) return
    seen.add(normalised)
    out.push(normalised)
  }

  if (trimmed.startsWith("http://")) {
    push(`https://${trimmed.slice("http://".length)}`)
  }
  if (trimmed.includes("/remote.axd?http://")) {
    push(trimmed.replace("/remote.axd?http://", "/remote.axd?https://"))
  }
  const marker = "/remote.axd?"
  const markerIndex = trimmed.indexOf(marker)
  if (markerIndex >= 0) {
    const nested = trimmed.slice(markerIndex + marker.length)
    if (nested) {
      push(nested.startsWith("http://") ? `https://${nested.slice("http://".length)}` : nested)
    }
  }
  push(trimmed)
  return out
}

function buildPlayerImageSources(playerName: string, teamHint: string | null, rows: PlayerImageRecord[]): string[] {
  const sorted = buildPlayerImageCandidates(playerName, teamHint, rows)
  const out: string[] = []
  for (const row of sorted) {
    for (const source of [row.body_image, row.head_image]) {
      for (const variant of normaliseRemoteImageCandidates(source)) {
        out.push(variant)
      }
    }
  }
  out.push("/body-shot.png")
  return out
}

function buildPlayerImageCandidates(playerName: string, teamHint: string | null, rows: PlayerImageRecord[]): PlayerImageRecord[] {
  const targetNorm = normalisePersonName(playerName)
  const targetParsed = parsePersonName(playerName)
  const teamNorm = teamHint ? normalisePersonName(teamHint) : ""

  const candidates = rows.filter((row) => {
    const rowName = row.player ?? ""
    if (!rowName) return false
    const rowNorm = normalisePersonName(rowName)
    if (rowNorm === targetNorm) return true
    const parsed = parsePersonName(rowName)
    return (
      parsed.last &&
      parsed.last === targetParsed.last &&
      parsed.first[0] &&
      parsed.first[0] === targetParsed.first[0]
    )
  })

  return [...candidates].sort((a, b) => {
    const aTeamMatch = teamNorm && a.team ? normalisePersonName(a.team) === teamNorm : false
    const bTeamMatch = teamNorm && b.team ? normalisePersonName(b.team) === teamNorm : false
    if (aTeamMatch !== bTeamMatch) return aTeamMatch ? -1 : 1

    const aHasBody = Boolean(a.body_image)
    const bHasBody = Boolean(b.body_image)
    if (aHasBody !== bHasBody) return aHasBody ? -1 : 1

    const aHasImage = Boolean(a.body_image || a.head_image)
    const bHasImage = Boolean(b.body_image || b.head_image)
    if (aHasImage !== bHasImage) return aHasImage ? -1 : 1

    const aDate = a.last_seen_match_date ?? ""
    const bDate = b.last_seen_match_date ?? ""
    return bDate.localeCompare(aDate)
  })
}

function primaryTeamForRows(rows: PlayerStat[]): string | null {
  const counts = new Map<string, number>()
  for (const row of rows) {
    const team = typeof row.Team === "string" ? row.Team : ""
    if (!team) continue
    counts.set(team, (counts.get(team) ?? 0) + 1)
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
}

function sortRowsByDateDesc(rows: PlayerStat[]): PlayerStat[] {
  return [...rows].sort((a, b) => {
    const dateA = typeof a.match_date === "string" ? a.match_date : `${a.Year}-${String(a.Round).padStart(2, "0")}`
    const dateB = typeof b.match_date === "string" ? b.match_date : `${b.Year}-${String(b.Round).padStart(2, "0")}`
    return dateB.localeCompare(dateA)
  })
}

function quantile(values: number[], q: number): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const position = (sorted.length - 1) * q
  const lowerIndex = Math.floor(position)
  const upperIndex = Math.ceil(position)
  if (lowerIndex === upperIndex) return sorted[lowerIndex]
  const weight = position - lowerIndex
  return sorted[lowerIndex] * (1 - weight) + sorted[upperIndex] * weight
}

function buildFantasyWeeklyRows(
  fantasyPlayers: FantasyPlayerSnapshot[],
  snapshot: FantasyOwnershipBaselineSnapshot | null
): FantasyWeeklyRow[] {
  const baselineByPlayerId = new Map<number, number | null>()
  for (const point of snapshot?.points ?? []) {
    baselineByPlayerId.set(point.playerId, point.ownedBy)
  }

  return fantasyPlayers
    .map((player) => {
      const baseline = baselineByPlayerId.get(player.id)
      const weeklyDelta = baseline == null || player.ownedBy == null ? null : player.ownedBy - baseline
      return {
        id: player.id,
        name: player.name,
        positionLabel: player.positionLabel,
        ownedBy: player.ownedBy,
        weeklyDelta,
        avgPoints: player.avgPoints,
      }
    })
    .sort((a, b) => {
      const aDelta = a.weeklyDelta ?? -Infinity
      const bDelta = b.weeklyDelta ?? -Infinity
      if (bDelta !== aDelta) return bDelta - aDelta
      return (b.ownedBy ?? -1) - (a.ownedBy ?? -1)
    })
    .slice(0, 3)
}

function buildDrawPreviewRows(draw2026Data: Draw2026Data | null, team: string | null): DrawPreviewRow[] {
  if (!draw2026Data || !team) return []
  const teamKey = normaliseTeamKey(team)
  if (!teamKey) return []

  return draw2026Data.rows
    .filter((row) => normaliseTeamKey(row.home) === teamKey || normaliseTeamKey(row.away) === teamKey)
    .slice(0, 13)
    .map((row) => {
      const isHome = normaliseTeamKey(row.home) === teamKey
      const opponent = isHome ? row.away : row.home
      return {
        round: row.round,
        opponent,
        opponentLogoUrl: draw2026Data.teamLogos[normaliseTeamKey(opponent)] ?? null,
        isHome,
      }
    })
}

function buildH2HPreviews(snapshot: BettingOddsSnapshot, limit = 2): BettingMatchPreview[] {
  const grouped = new Map<string, BettingMatchPreview>()

  for (const row of snapshot.h2h) {
    const key = `${row.date}|${row.match}`
    const current = grouped.get(key) ?? {
      dateLabel: formatShortDate(row.date),
      match: row.match,
      rows: [],
    }
    current.rows.push(row)
    grouped.set(key, current)
  }

  return [...grouped.values()]
    .filter((group) => group.rows.length >= 2)
    .sort((a, b) => a.rows[0].date.localeCompare(b.rows[0].date) || a.match.localeCompare(b.match))
    .slice(0, limit)
}

function buildOpponentHeatmapRows(rows: PlayerStat[], years: string[]): HeatmapRow[] {
  const opponents = [...new Set(rows.map((row) => String(row.Opponent ?? "").trim()).filter(Boolean))]
    .sort()
    .slice(0, 6)
  const scopes = ["All", ...years]

  return scopes.map((scope) => {
    const scopedRows = scope === "All" ? rows : rows.filter((row) => row.Year === scope)
    return {
      label: scope,
      cells: opponents.map((opponent) => {
        const values = scopedRows
          .filter((row) => row.Opponent === opponent)
          .map((row) => toFiniteNumber(row.Fantasy))
          .filter((value): value is number => value !== null)
        const average = values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : null
        return { opponent, average, count: values.length }
      }),
    }
  })
}

function buildBoxSummaries(rows: PlayerStat[], years: string[]): BoxSummaryRow[] {
  const scopes = ["All", ...years]
  return scopes.flatMap((scope) => {
    const values = (scope === "All" ? rows : rows.filter((row) => row.Year === scope))
      .map((row) => toFiniteNumber(row.Fantasy))
      .filter((value): value is number => value !== null)
    if (values.length === 0) return []
    return [{
      label: scope,
      count: values.length,
      low: Math.min(...values),
      q1: quantile(values, 0.25),
      median: quantile(values, 0.5),
      q3: quantile(values, 0.75),
      high: Math.max(...values),
    }]
  })
}

function getScatterPoints(rows: PlayerStat[]): Array<{ x: number; y: number }> {
  return rows
    .map((row) => ({
      x: toFiniteNumber(row["All Run Metres"]),
      y: toFiniteNumber(row.Fantasy),
    }))
    .filter((point): point is { x: number; y: number } => point.x != null && point.y != null)
    .slice(0, 18)
}

function getScaledHeatColour(value: number | null): string {
  if (value == null) return "rgba(255,255,255,0.05)"
  const clamped = Math.max(20, Math.min(90, value))
  const ratio = (clamped - 20) / 70
  const r = Math.round(210 - ratio * 130)
  const g = Math.round(90 + ratio * 125)
  const b = Math.round(120 - ratio * 45)
  return `rgba(${r}, ${g}, ${b}, 0.55)`
}

function PreviewFrame({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="h-full bg-[linear-gradient(180deg,rgba(27,33,61,0.96),rgba(15,18,36,0.96))] p-3 sm:p-5">
      <div className="flex items-center justify-between gap-3 border-b border-white/8 pb-3">
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-[#8d63ff]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#00f58a]" />
          <span className="h-2.5 w-2.5 rounded-full bg-white/30" />
        </div>
        <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/42">{title}</div>
      </div>
      <div className="mt-3 min-h-[300px] sm:mt-4 sm:min-h-[420px] lg:min-h-[520px]">{children}</div>
    </div>
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
  children,
}: {
  eyebrow: string
  title: string
  description: string
  bullets: string[]
  ctaHref: string
  ctaLabel: string
  children: React.ReactNode
}) {
  return (
    <section className="space-y-6 border border-white/8 bg-[linear-gradient(180deg,rgba(16,20,42,0.92),rgba(11,14,29,0.92))] p-4 sm:space-y-7 sm:p-6">
      <div className="min-w-0">
        <SectionEyebrow>{eyebrow}</SectionEyebrow>
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
          className="mt-5 inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/5 px-4 py-2 text-sm font-semibold text-white/85 transition-colors hover:border-white/22 hover:text-white sm:mt-6"
        >
          {ctaLabel}
          <span aria-hidden="true">→</span>
        </Link>
      </div>
      <div className="h-full min-w-0">{children}</div>
    </section>
  )
}

function SimpleScatter({ points }: { points: Array<{ x: number; y: number }> }) {
  if (points.length === 0) {
    return <div className="flex h-48 items-center justify-center text-xs text-white/35">No scatter data</div>
  }

  const minX = Math.min(...points.map((point) => point.x))
  const maxX = Math.max(...points.map((point) => point.x))
  const minY = Math.min(...points.map((point) => point.y))
  const maxY = Math.max(...points.map((point) => point.y))

  const scaleX = (value: number) => {
    if (maxX === minX) return 30
    return 30 + ((value - minX) / (maxX - minX)) * 250
  }
  const scaleY = (value: number) => {
    if (maxY === minY) return 120
    return 120 - ((value - minY) / (maxY - minY)) * 90
  }

  return (
    <svg viewBox="0 0 320 150" className="h-48 w-full">
      <line x1="30" y1="10" x2="30" y2="125" stroke="rgba(255,255,255,0.16)" strokeWidth="1" />
      <line x1="30" y1="125" x2="300" y2="125" stroke="rgba(255,255,255,0.16)" strokeWidth="1" />
      {points.map((point, index) => (
        <circle
          key={`${point.x}-${point.y}-${index}`}
          cx={scaleX(point.x)}
          cy={scaleY(point.y)}
          r="4.5"
          fill={index === points.length - 1 ? "#ffe066" : index > points.length / 2 ? "#00f58a" : "#8d63ff"}
          fillOpacity="0.88"
        />
      ))}
      <text x="160" y="147" textAnchor="middle" fontSize="10" fill="rgba(255,255,255,0.38)">Run Metres</text>
      <text x="12" y="70" textAnchor="middle" fontSize="10" fill="rgba(255,255,255,0.38)" transform="rotate(-90 12 70)">Fantasy</text>
    </svg>
  )
}

export default async function Home() {
  const [fantasyPlayers, ownershipBaselineSnapshot, bettingSnapshot, availableYears, playerImages, draw2026Data] = await Promise.all([
    fetchFantasyPlayersSnapshot(),
    fetchLatestFantasyOwnershipBaselineSnapshot(),
    fetchBettingOddsSnapshot(),
    fetchAvailableYears(),
    fetchPlayerImages(),
    loadDraw2026Data().catch(() => null),
  ])

  const previewYears = [...availableYears].map(String).sort((a, b) => Number(b) - Number(a)).slice(0, 3)
  const plotYears = previewYears.filter((year) => year !== "2024")
  const spotlightLocalRows = fantasyPlayers[0]?.name
    ? await fetchFantasyPlayerStatsAllYears(fantasyPlayers[0].name)
    : []

  const fantasyWeeklyRows = buildFantasyWeeklyRows(fantasyPlayers, ownershipBaselineSnapshot)
  const spotlightFantasyPlayer = fantasyPlayers.find((player) => player.id === fantasyWeeklyRows[0]?.id) ?? fantasyPlayers[0] ?? null
  const spotlightRows = spotlightFantasyPlayer?.name === fantasyPlayers[0]?.name
    ? spotlightLocalRows
    : spotlightFantasyPlayer
      ? await fetchFantasyPlayerStatsAllYears(spotlightFantasyPlayer.name)
      : []

  const spotlightSortedRows = sortRowsByDateDesc(spotlightRows)
  const spotlightTeam = primaryTeamForRows(spotlightSortedRows)
  const spotlightImageSources = spotlightFantasyPlayer
    ? buildPlayerImageSources(spotlightFantasyPlayer.name, spotlightTeam, playerImages)
    : ["/body-shot.png"]
  const spotlightWeeklyDelta = fantasyWeeklyRows.find((row) => row.id === spotlightFantasyPlayer?.id)?.weeklyDelta ?? null
  const spotlightDrawRows = buildDrawPreviewRows(draw2026Data, spotlightTeam)
  const spotlightCardImage = spotlightFantasyPlayer
    ? {
        player: spotlightFantasyPlayer.name,
        team: spotlightTeam,
        number: null,
        position: spotlightFantasyPlayer.positionLabel ?? null,
        head_image: null,
        body_image: spotlightImageSources.find((source) => source !== "/body-shot.png") ?? spotlightImageSources[0] ?? "/body-shot.png",
        last_seen_match_date: null,
      }
    : null
  const spotlightTeamLogoUrl = spotlightTeam && draw2026Data
    ? draw2026Data.teamLogos[normaliseTeamKey(spotlightTeam)] ?? null
    : null
  const spotlightHeatmapRows = buildOpponentHeatmapRows(spotlightSortedRows, plotYears)
  const spotlightBoxSummaries = buildBoxSummaries(spotlightSortedRows, plotYears)
  const spotlightScatterPoints = getScatterPoints(spotlightSortedRows)

  const h2hPreviews = buildH2HPreviews(bettingSnapshot)
  return (
    <div className="relative overflow-hidden text-nrl-text">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />

      <div className="relative mx-auto flex min-h-screen w-full max-w-7xl flex-col px-4 pb-16 pt-6 sm:px-6 lg:px-8">
        <header className="flex items-center justify-between gap-4 border-b border-white/8 pb-4">
          <Link href="/" className="inline-flex items-center gap-3">
            <Image src="/logo-mark.svg" alt="Short Side logo" width={30} height={30} priority />
            <div>
              <div className="text-[9px] font-semibold uppercase tracking-[0.28em] text-white/45">Short Side</div>
              <div className="text-sm font-semibold text-white/92">NRL Analytics Hub</div>
            </div>
          </Link>

          <nav className="hidden items-center gap-5 text-xs text-white/55 md:flex">
            <Link href="/dashboard/fantasy" className="transition-colors hover:text-white">Fantasy</Link>
            <Link href="/dashboard/betting" className="transition-colors hover:text-white">Betting</Link>
            <Link href="/dashboard/players" className="transition-colors hover:text-white">Stats</Link>
          </nav>

          <div className="flex items-center gap-2">
            <Link
              href="/sign-in"
              className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-white/80 transition-colors hover:border-white/20 hover:text-white"
            >
              Sign in
            </Link>
          </div>
        </header>

        <LandingHeroScrollShell>
          <section className="grid gap-6 pb-10 pt-8 sm:gap-8 sm:pb-12 sm:pt-10 lg:grid-cols-[1.02fr_0.98fr] lg:items-end lg:pb-0 lg:pt-14">
            <div className="max-w-2xl">
              <div className="inline-flex items-center gap-2 rounded-full border border-emerald-400/15 bg-emerald-400/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.24em] text-emerald-300">
                Live NRL Analysis Platform
              </div>
              <h1 className="mt-5 pb-2 text-[2.85rem] font-black leading-[0.98] tracking-tight text-white sm:text-6xl">
                Smarter Analysis for
                {" "}
                <span className="bg-[linear-gradient(135deg,#ffffff_0%,#ae94ff_44%,#53ffd0_100%)] bg-clip-text text-transparent">
                  Rugby League
                </span>
              </h1>
              <p className="mt-4 max-w-xl text-sm leading-6 text-white/62 sm:text-base sm:leading-7">
                Short Side brings Fantasy, Betting, and Stats into one hub for NRL analytics.
              </p>

              <div className="mt-6 grid grid-cols-2 gap-3 sm:flex sm:flex-row sm:flex-wrap">
                <Link
                  href="/dashboard/fantasy"
                  className="inline-flex items-center justify-center rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-white/80 transition-colors hover:border-white/20 hover:text-white"
                >
                  Open Fantasy
                </Link>
                <Link
                  href="/dashboard/betting"
                  className="inline-flex items-center justify-center rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-white/80 transition-colors hover:border-white/20 hover:text-white"
                >
                  Open Betting
                </Link>
                <Link
                  href="/dashboard/players"
                  className="col-span-2 inline-flex items-center justify-center rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-white/80 transition-colors hover:border-white/20 hover:text-white sm:col-span-1"
                >
                  Open Stats
                </Link>
              </div>

              <div className="relative mt-6 flex items-end justify-center lg:hidden">
                <div className="relative flex h-[15.5rem] w-full max-w-[26rem] items-end justify-center overflow-hidden rounded-[1.6rem] px-1 pt-3">
                  <Image
                    src="/nrl_players-removebg-preview.png"
                    alt="NRL players"
                    width={720}
                    height={720}
                    priority
                    className="relative z-10 translate-x-2 h-[104%] w-auto max-w-[126%] object-contain object-bottom"
                  />
                </div>
              </div>
            </div>

            <div className="relative hidden lg:flex lg:items-end lg:justify-center lg:self-end">
              <div className="relative flex h-[16.5rem] w-full max-w-[30rem] items-end justify-center overflow-visible rounded-[2rem] px-1 pt-3">
                <Image
                  src="/nrl_players-removebg-preview.png"
                  alt="NRL players"
                  width={720}
                  height={720}
                  priority
                  className="relative z-10 translate-x-3 h-[118%] w-auto max-w-[141%] object-contain object-bottom"
                />
              </div>
            </div>
          </section>
        </LandingHeroScrollShell>


        <section className="space-y-6 border-t border-white/8 py-10">
          <div>
            <SectionEyebrow>Built For Weekly Decisions</SectionEyebrow>
            <h2 className="mt-2 text-2xl font-bold text-white">Previews of the full suite</h2>
          </div>

          <LandingSuiteTabs labels={["Fantasy", "Betting"]}>
          <FeatureSection
            eyebrow="Fantasy"
            title="Ownership, pricing, game logs, and visuals in one screen"
            description="Use the Fantasy dashboard to move from ownership shifts to actual player-level context. The preview rotates between the player detail view and the deeper visual layer."
            bullets={[
              "Ownership and price info",
              "All features and filters",
              "Full game logs",
              "Detailed visuals",
            ]}
            ctaHref="/dashboard/fantasy"
            ctaLabel="Open Fantasy"
          >
            <LandingCarousel>
              <PreviewFrame title="Fantasy / Player Detail">
                <div className="grid gap-3 sm:gap-4 xl:grid-cols-[290px_minmax(0,1fr)_220px]">
                  <div className="relative flex min-h-[12rem] items-center justify-center overflow-hidden rounded-2xl border border-white/8 bg-[#1b2140] p-2 sm:min-h-0 sm:p-3">
                    <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_30%_24%,rgba(71,255,182,0.22),transparent_34%),radial-gradient(circle_at_74%_78%,rgba(129,92,255,0.24),transparent_42%),linear-gradient(180deg,rgba(255,255,255,0.02),rgba(255,255,255,0))]" />
                    <div className="pointer-events-none absolute left-[8%] top-[12%] h-24 w-24 rounded-full bg-emerald-300/10 blur-2xl" />
                    <div className="pointer-events-none absolute bottom-[10%] right-[12%] h-28 w-28 rounded-full bg-violet-400/12 blur-3xl" />
                    <div className="relative w-full max-w-[10rem] sm:max-w-[18.5rem]">
                      <PlayerImageCard
                        playerName={spotlightFantasyPlayer?.name ?? "Fantasy player"}
                        imageRow={spotlightCardImage}
                        teamLogoUrl={spotlightTeamLogoUrl}
                        fantasyPosition={spotlightFantasyPlayer?.positionLabel ?? null}
                        compact
                        frameless
                        priority
                      />
                    </div>
                  </div>

                  <div className="rounded-2xl border border-white/8 bg-[#1b2140] p-2.5 sm:p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <h4 className="text-xl font-bold text-white sm:text-3xl">{spotlightFantasyPlayer?.name ?? "Fantasy player"}</h4>
                      <span className="rounded-md border border-white/8 bg-white/[0.03] px-2 py-1 text-xs text-white/55">Team: {spotlightTeam ?? "-"}</span>
                      <span className="rounded-md border border-white/8 bg-white/[0.03] px-2 py-1 text-xs text-white/55">Status: {spotlightFantasyPlayer?.status ?? "available"}</span>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2.5 sm:mt-4 sm:min-h-[164px] sm:grid-rows-2 sm:gap-3">
                      <div className="rounded-xl border border-white/8 bg-white/[0.03] p-2.5 sm:p-3">
                        <div className="text-[10px] uppercase tracking-[0.16em] text-white/35">Price</div>
                        <div className="mt-2 text-lg font-bold text-white sm:mt-3 sm:text-2xl">{formatCurrency(spotlightFantasyPlayer?.cost ?? null)}</div>
                      </div>
                      <div className="rounded-xl border border-white/8 bg-white/[0.03] p-2.5 sm:p-3">
                        <div className="text-[10px] uppercase tracking-[0.16em] text-white/35">Avg</div>
                        <div className="mt-2 text-lg font-bold text-white sm:mt-3 sm:text-2xl">{formatNumber(spotlightFantasyPlayer?.avgPoints ?? null, 1)}</div>
                      </div>
                      <div className="rounded-xl border border-white/8 bg-white/[0.03] p-2.5 sm:p-3">
                        <div className="text-[10px] uppercase tracking-[0.16em] text-white/35">Own %</div>
                        <div className="mt-2 text-lg font-bold text-white sm:mt-3 sm:text-2xl">{formatPercent(spotlightFantasyPlayer?.ownedBy ?? null)}</div>
                        <div className="mt-1 text-[11px] text-white/42">Weekly {formatSignedPercent(spotlightWeeklyDelta)}</div>
                      </div>
                      <div className="rounded-xl border border-white/8 bg-white/[0.03] p-2.5 sm:p-3">
                        <div className="text-[10px] uppercase tracking-[0.16em] text-white/35">Priced At</div>
                        <div className="mt-2 text-lg font-bold text-white sm:mt-3 sm:text-2xl">{formatNumber(spotlightFantasyPlayer?.pricedAt ?? null, 0)}</div>
                      </div>
                    </div>
                  </div>

                  <div className="hidden h-full flex-col rounded-2xl border border-white/8 bg-[#1b2140] p-3 xl:row-span-2 xl:flex">
                    <div className="text-xs font-bold uppercase tracking-wide text-emerald-300">2026 Draw</div>
                    <div className="mt-1 text-[11px] text-white/38">{spotlightTeam ?? "Team"}</div>
                    <div className="mt-3 grid gap-1.5 sm:grid-cols-2 xl:grid-cols-1">
                      {spotlightDrawRows.map((row) => (
                        <div key={row.round} className="rounded-lg border border-white/8 bg-white/[0.03] px-2.5 py-1.5">
                          <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/35">Rd {row.round}</div>
                          <div className="mt-1 flex items-center gap-2 text-[11px] text-white/78">
                            {row.opponentLogoUrl ? <ImageWithFallback sources={[row.opponentLogoUrl]} alt={row.opponent ?? "Opponent"} className="h-4 w-4 object-contain" /> : null}
                            <span>{row.isHome ? "vs" : "@"} {row.opponent ?? "-"}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-white/8 bg-[#20274a] p-3 xl:col-span-2">
                    <div className="space-y-3 sm:hidden">
                      <div>
                        <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/35">Season</div>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {previewYears.map((year) => (
                            <span key={`mobile-${year}`} className="rounded border border-emerald-400/20 bg-emerald-400/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-300">{year}</span>
                          ))}
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="rounded-lg border border-white/8 bg-white/[0.03] px-3 py-2 text-xs text-white/75">All Opponents</div>
                        <div className="rounded-lg border border-white/8 bg-white/[0.03] px-3 py-2 text-xs text-white/75">All Positions</div>
                        <div className="rounded-lg border border-white/8 bg-white/[0.03] px-3 py-2 text-xs text-white/75">Finals: Yes</div>
                        <div className="rounded-lg border border-white/8 bg-white/[0.03] px-3 py-2 text-xs text-white/75">Over: 40 Mins</div>
                        <div className="rounded-lg border border-white/8 bg-white/[0.03] px-3 py-2 text-xs text-white/75">Under: Any</div>
                        <div className="rounded-lg border border-white/8 bg-white/[0.03] px-3 py-2 text-xs text-white/75">Teammate: None</div>
                        <div className="rounded-lg border border-white/8 bg-white/[0.03] px-3 py-2 text-xs text-white/75">Mate Pos: All</div>
                        <div className="rounded-lg border border-white/8 bg-white/[0.03] px-3 py-2 text-xs text-emerald-300">Mode: With</div>
                      </div>
                      <div className="space-y-2">
                        {spotlightSortedRows.slice(0, 3).map((row, index) => (
                          <div key={`mobile-row-${row.Year}-${row.Round}-${index}`} className="rounded-xl border border-white/8 bg-white/[0.03] px-3 py-2.5">
                            <div className="flex items-center justify-between gap-3">
                              <div className="min-w-0">
                                <div className="truncate text-sm font-semibold text-white">{row.Opponent ?? "-"}</div>
                                <div className="mt-0.5 text-[11px] text-white/45">
                                  {typeof row.match_date === "string" ? formatShortDate(row.match_date) : row.Round_Label}
                                </div>
                              </div>
                              <div className="text-right">
                                <div className="text-sm font-bold text-emerald-300">{formatNumber(toFiniteNumber(row.Fantasy), 0)}</div>
                                <div className="text-[11px] text-white/45">{formatNumber(toFiniteNumber(row["Mins Played"]), 0)} mins</div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                      <div className="rounded-xl border border-white/8 bg-white/[0.03] p-3">
                        <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-300">2026 Draw</div>
                        <div className="mt-2 space-y-2">
                          {spotlightDrawRows.slice(0, 4).map((row) => (
                            <div key={`mobile-draw-${row.round}`} className="flex items-center justify-between gap-3 rounded-lg border border-white/8 bg-[#20274a] px-3 py-2">
                              <div className="min-w-0">
                                <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/38">Rd {row.round}</div>
                                <div className="mt-0.5 flex items-center gap-2 text-xs text-white/78">
                                  {row.opponentLogoUrl ? <ImageWithFallback sources={[row.opponentLogoUrl]} alt={row.opponent ?? "Opponent"} className="h-3.5 w-3.5 object-contain" /> : null}
                                  <span className="truncate">{row.isHome ? "vs" : "@"} {row.opponent ?? "-"}</span>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                      <div className="hidden gap-3 md:grid md:grid-cols-3">
                      <div>
                        <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/35">Season</div>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {previewYears.map((year) => (
                            <span key={year} className="rounded border border-emerald-400/20 bg-emerald-400/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-300">{year}</span>
                          ))}
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/35">Opponent</div>
                        <div className="mt-2 rounded-lg border border-white/8 bg-white/[0.03] px-3 py-2 text-xs text-white/75">All Opponents</div>
                      </div>
                      <div>
                        <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/35">Position</div>
                        <div className="mt-2 rounded-lg border border-white/8 bg-white/[0.03] px-3 py-2 text-xs text-white/75">All Positions</div>
                      </div>
                      <div>
                        <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/35">Finals</div>
                        <div className="mt-2 rounded-lg border border-white/8 bg-white/[0.03] px-3 py-2 text-xs text-white/75">Yes</div>
                      </div>
                      <div>
                        <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/35">Minutes Over</div>
                        <div className="mt-2 rounded-lg border border-white/8 bg-white/[0.03] px-3 py-2 text-xs text-white/75">40 Mins</div>
                      </div>
                      <div>
                        <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/35">Minutes Under</div>
                        <div className="mt-2 rounded-lg border border-white/8 bg-white/[0.03] px-3 py-2 text-xs text-white/75">Any</div>
                      </div>
                      <div>
                        <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/35">Teammate</div>
                        <div className="mt-2 rounded-lg border border-white/8 bg-white/[0.03] px-3 py-2 text-xs text-white/75">None</div>
                      </div>
                      <div>
                        <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/35">Teammate Position</div>
                        <div className="mt-2 rounded-lg border border-white/8 bg-white/[0.03] px-3 py-2 text-xs text-white/75">All</div>
                      </div>
                      <div>
                        <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/35">With / Without</div>
                        <div className="mt-2 inline-flex rounded-md border border-white/8 bg-white/[0.03] p-1 text-[10px] font-semibold uppercase tracking-[0.16em]">
                          <span className="rounded bg-emerald-400/16 px-2 py-1 text-emerald-300">With</span>
                          <span className="px-2 py-1 text-white/38">Without</span>
                        </div>
                      </div>
                    </div>
                      <div className="mt-3 hidden overflow-x-auto rounded-xl border border-white/8 sm:block">
                        <table className="min-w-[42rem] divide-y divide-white/8 text-left text-[11px] text-white/72 sm:min-w-full">
                          <thead className="bg-white/[0.03] text-[10px] uppercase tracking-[0.14em] text-white/35">
                            <tr>
                              <th className="px-3 py-2">Season</th>
                              <th className="px-3 py-2">Date</th>
                              <th className="px-3 py-2">Opponent</th>
                              <th className="px-3 py-2">Position</th>
                              <th className="px-3 py-2 text-right">Fantasy</th>
                              <th className="px-3 py-2 text-right">Mins</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-white/8">
                            {spotlightSortedRows.slice(0, 6).map((row, index) => (
                              <tr key={`${row.Year}-${row.Round}-${index}`}>
                                <td className="px-3 py-2">{row.Year}</td>
                                <td className="px-3 py-2">{typeof row.match_date === "string" ? formatShortDate(row.match_date) : row.Round_Label}</td>
                                <td className="px-3 py-2">{row.Opponent ?? "-"}</td>
                                <td className="px-3 py-2">{row.Position ?? spotlightFantasyPlayer?.positionLabel ?? "-"}</td>
                                <td className="px-3 py-2 text-right font-semibold text-emerald-300">{formatNumber(toFiniteNumber(row.Fantasy), 0)}</td>
                                <td className="px-3 py-2 text-right">{formatNumber(toFiniteNumber(row["Mins Played"]), 0)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                  </div>
                </div>
              </PreviewFrame>

              <PreviewFrame title="Fantasy / Visuals">
                <div className="space-y-4">
                  <div className="rounded-2xl border border-white/8 bg-[#1b2140] p-3">
                    <div className="text-xs font-bold uppercase tracking-wide text-emerald-300">Average vs Opponent</div>
                    <div className="mt-3 grid gap-2 sm:hidden">
                      {spotlightHeatmapRows.map((row) => (
                        <div key={`${row.label}-mobile`} className="rounded-xl border border-white/8 bg-white/[0.03] p-2.5">
                          <div className="text-[13px] font-semibold text-white">{row.label}</div>
                          <div className="mt-2 grid grid-cols-3 gap-1.5">
                            {row.cells.slice(0, 3).map((cell) => (
                              <div key={`${row.label}-${cell.opponent}-mobile`} className="rounded-lg border border-white/8 px-1.5 py-1.5 text-center" style={{ backgroundColor: getScaledHeatColour(cell.average) }}>
                                <div className="text-[9px] font-semibold uppercase tracking-[0.12em] text-white/60">{cell.opponent.slice(0, 3).toUpperCase()}</div>
                                <div className="mt-0.5 text-[15px] font-semibold leading-none text-white">{cell.average == null ? "-" : cell.average.toFixed(1)}</div>
                                <div className="text-[9px] text-white/45">n={cell.count}</div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="mt-3 hidden overflow-x-auto rounded-xl border border-white/8 sm:block">
                      <table className="min-w-[34rem] text-center text-[11px] text-white/72 sm:min-w-full">
                        <thead className="bg-white/[0.03] text-[10px] uppercase tracking-[0.14em] text-white/35">
                          <tr>
                            <th className="px-2 py-2 text-left">Season</th>
                            {spotlightHeatmapRows[0]?.cells.map((cell) => (
                              <th key={cell.opponent} className="px-2 py-2">{cell.opponent.slice(0, 3).toUpperCase()}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/8">
                          {spotlightHeatmapRows.map((row) => (
                            <tr key={row.label}>
                              <td className="px-2 py-2 text-left font-semibold text-white">{row.label}</td>
                              {row.cells.map((cell) => (
                                <td key={`${row.label}-${cell.opponent}`} className="px-2 py-2" style={{ backgroundColor: getScaledHeatColour(cell.average) }}>
                                  <div className="font-semibold text-white">{cell.average == null ? "-" : cell.average.toFixed(1)}</div>
                                  <div className="text-[9px] text-white/50">n={cell.count}</div>
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-white/8 bg-[#1b2140] p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-xs font-bold uppercase tracking-wide text-emerald-300">Fantasy Score Box Plot</div>
                      <div className="hidden text-[10px] text-white/38 sm:block">All games plus selected years</div>
                    </div>
                    <div className="mt-3 hidden space-y-3 sm:block">
                      {spotlightBoxSummaries.map((summary) => {
                        const min = Math.min(...spotlightBoxSummaries.map((item) => item.low))
                        const max = Math.max(...spotlightBoxSummaries.map((item) => item.high))
                        const scale = (value: number) => (max === min ? 50 : ((value - min) / (max - min)) * 100)
                        return (
                          <div key={summary.label} className="grid gap-2 sm:grid-cols-[84px_1fr] sm:items-center sm:gap-3">
                            <div>
                              <div className="text-sm font-semibold text-white">{summary.label}</div>
                              <div className="text-[10px] uppercase tracking-[0.16em] text-white/35">n={summary.count}</div>
                            </div>
                            <div>
                              <div className="relative h-9">
                                <div className="absolute left-0 right-0 top-4 h-px bg-white/18" />
                                <div className="absolute top-[15px] h-4 w-px bg-white/35" style={{ left: `${scale(summary.low)}%` }} />
                                <div className="absolute top-[15px] h-4 w-px bg-white/35" style={{ left: `${scale(summary.high)}%` }} />
                                <div className="absolute top-2 h-6 rounded-md border border-emerald-400 bg-emerald-400/16" style={{ left: `${scale(summary.q1)}%`, width: `${Math.max(4, scale(summary.q3) - scale(summary.q1))}%` }} />
                                <div className="absolute top-2 h-6 w-1 bg-white" style={{ left: `${scale(summary.median)}%` }} />
                              </div>
                              <div className="mt-1 flex justify-between text-[10px] uppercase tracking-[0.14em] text-white/35">
                                <span>Low {summary.low.toFixed(1)}</span>
                                <span>Median {summary.median.toFixed(1)}</span>
                                <span>High {summary.high.toFixed(1)}</span>
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                    <div className="mt-3 space-y-2 sm:hidden">
                      {(() => {
                        const min = Math.min(...spotlightBoxSummaries.map((item) => item.low))
                        const max = Math.max(...spotlightBoxSummaries.map((item) => item.high))
                        const scale = (value: number) => (max === min ? 50 : ((value - min) / (max - min)) * 100)
                        return spotlightBoxSummaries.slice(0, 3).map((summary) => (
                          <div key={`${summary.label}-box-mobile`} className="rounded-xl border border-white/8 bg-white/[0.03] px-2.5 py-2.5">
                            <div className="flex items-center justify-between gap-3">
                              <div>
                                <div className="text-[12px] font-semibold text-white">{summary.label}</div>
                                <div className="text-[9px] uppercase tracking-[0.14em] text-white/40">n={summary.count}</div>
                              </div>
                              <div className="text-sm font-bold text-white">{summary.median.toFixed(0)}</div>
                            </div>
                            <div className="mt-2">
                              <div className="relative h-7">
                                <div className="absolute left-0 right-0 top-3.5 h-px bg-white/18" />
                                <div className="absolute top-3 h-3 w-px bg-white/35" style={{ left: `${scale(summary.low)}%` }} />
                                <div className="absolute top-3 h-3 w-px bg-white/35" style={{ left: `${scale(summary.high)}%` }} />
                                <div className="absolute top-1.5 h-4 rounded-md border border-emerald-400 bg-emerald-400/16" style={{ left: `${scale(summary.q1)}%`, width: `${Math.max(4, scale(summary.q3) - scale(summary.q1))}%` }} />
                                <div className="absolute top-1.5 h-4 w-1 bg-white" style={{ left: `${scale(summary.median)}%` }} />
                              </div>
                              <div className="mt-1 flex justify-between text-[9px] uppercase tracking-[0.12em] text-white/40">
                                <span>{summary.low.toFixed(0)}</span>
                                <span>{summary.median.toFixed(0)}</span>
                                <span>{summary.high.toFixed(0)}</span>
                              </div>
                            </div>
                          </div>
                        ))
                      })()}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-white/8 bg-[#1b2140] p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-xs font-bold uppercase tracking-wide text-emerald-300">Stat vs Fantasy</div>
                        <div className="mt-1 text-[10px] uppercase tracking-[0.16em] text-white/35">Run Metres</div>
                      </div>
                      <div className="rounded border border-emerald-400/20 bg-emerald-400/10 px-2 py-1 text-[10px] font-semibold text-emerald-300">
                        games = {spotlightScatterPoints.length}
                      </div>
                    </div>
                    <div className="mt-3 rounded-xl border border-white/8 bg-[#171c36] p-3">
                      <SimpleScatter points={spotlightScatterPoints} />
                    </div>
                  </div>
                </div>
              </PreviewFrame>
            </LandingCarousel>
          </FeatureSection>

          <FeatureSection
            eyebrow="Betting"
            title="Odds comparison, staking, and tracker tools together"
            description="Open the Betting section when you want clean bookmaker comparison, staking workflows, and a tracker that keeps your week organised from edge to result."
            bullets={[
              "Odds comparison for H2H, Line and Total",
              "Staking Calculator",
              "Bet Tracker",
            ]}
            ctaHref="/dashboard/betting"
            ctaLabel="Open Betting"
          >
            <LandingCarousel>
              <PreviewFrame title="Betting / Odds Comparison">
                <div className="space-y-4">
                  <div className="inline-flex rounded-md border border-white/8 bg-white/[0.03] p-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/42">
                    <span className="rounded bg-emerald-400/16 px-3 py-1 text-emerald-300">H2H</span>
                    <span className="px-3 py-1">Line</span>
                    <span className="px-3 py-1">Total</span>
                  </div>
                  <div className="space-y-3">
                    {h2hPreviews.slice(0, 2).map((preview, previewIndex) => (
                      <div key={`${preview.match}-${preview.dateLabel}-${previewIndex}`} className="rounded-2xl border border-white/8 bg-[#1b2140] p-4">
                        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-white/8 pb-3">
                          <div>
                            <div className="text-sm font-semibold text-white">{preview.match ?? "Upcoming market"}</div>
                            <div className="mt-1 text-[11px] text-white/38">{preview.dateLabel ?? "Live odds"}</div>
                          </div>
                          <div className="text-[11px] text-white/38">Best-book prices across current books</div>
                        </div>
                        <div className="mt-3 overflow-x-auto pb-1">
                          <div className="min-w-[36rem]">
                            <div className="grid grid-cols-[1.3fr_repeat(5,minmax(0,1fr))_0.7fr] items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/35">
                              <div>Outcome</div>
                              {BETTING_BOOKIE_COLUMNS.map((bookie) => (
                                <div key={bookie} className="flex justify-center"><Image src={BOOKIE_LOGOS[bookie]} alt={bookie} width={18} height={18} className="h-4 w-auto object-contain" /></div>
                              ))}
                              <div className="text-center">Best</div>
                            </div>
                            <div className="mt-2 space-y-2">
                              {preview.rows.slice(0, 2).map((row) => (
                                <div key={`${row.match}-${row.result}`} className="grid grid-cols-[1.3fr_repeat(5,minmax(0,1fr))_0.7fr] items-center gap-2 rounded-xl border border-white/8 bg-white/[0.03] px-3 py-3 text-sm text-white/76">
                                  <div className="font-semibold text-white">{row.result}</div>
                                  {BETTING_BOOKIE_COLUMNS.map((bookie) => (
                                    <div key={`${row.result}-${bookie}`} className="text-center font-semibold text-white/76">
                                      {row[bookie] != null ? formatNumber(row[bookie], 2) : "-"}
                                    </div>
                                  ))}
                                  <div className="text-center font-semibold text-emerald-300">{formatNumber(row.bestPrice, 2)}</div>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </PreviewFrame>

              <PreviewFrame title="Betting / Tools">
                <div className="space-y-4">
                  <div className="rounded-2xl border border-white/8 bg-[#1b2140] p-4">
                    <div className="text-xs font-bold uppercase tracking-wide text-white/78">Staking Calculator</div>
                    <div className="mt-3 grid gap-3 md:grid-cols-3">
                      <div className="rounded-xl border border-emerald-400/25 bg-emerald-400/10 p-3">
                        <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-300">Percentage Staking</div>
                        <div className="mt-1 text-[11px] text-white/55">Bet a % of your bankroll.</div>
                      </div>
                      <div className="rounded-xl border border-white/8 bg-white/[0.03] p-3">
                        <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/42">Target Profit</div>
                        <div className="mt-1 text-[11px] text-white/55">Hit a target profit %.</div>
                      </div>
                      <div className="rounded-xl border border-white/8 bg-white/[0.03] p-3">
                        <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/42">Kelly Staking</div>
                        <div className="mt-1 text-[11px] text-white/55">Stake from model edge.</div>
                      </div>
                    </div>
                    <div className="mt-3 grid gap-3 md:grid-cols-3">
                      <div className="rounded-lg border border-white/8 bg-[#171c36] px-3 py-2 text-xs text-white/72">Bankroll 2000</div>
                      <div className="rounded-lg border border-white/8 bg-[#171c36] px-3 py-2 text-xs text-white/72">Stake % 2</div>
                      <div className="rounded-lg border border-white/8 bg-[#171c36] px-3 py-2 text-xs text-white/72">Max Edge 0.06</div>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-white/8 bg-[#1b2140] p-4">
                    <div className="flex items-center justify-between gap-3 border-b border-white/8 pb-3">
                      <div className="text-xs font-bold uppercase tracking-wide text-white/78">Bet Tracker</div>
                      <div className="text-[11px] text-white/38">Hide Bets</div>
                    </div>
                    <div className="mt-3 grid gap-3 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-5">
                      <div className="rounded-lg border border-white/8 bg-[#171c36] px-3 py-2"><div className="text-[10px] uppercase tracking-[0.16em] text-white/35">Bets</div><div className="mt-1 text-lg font-bold text-white">{bettingSnapshot.h2h.length}</div></div>
                      <div className="rounded-lg border border-white/8 bg-[#171c36] px-3 py-2"><div className="text-[10px] uppercase tracking-[0.16em] text-white/35">Win Rate</div><div className="mt-1 text-lg font-bold text-white">60.0%</div></div>
                      <div className="rounded-lg border border-white/8 bg-[#171c36] px-3 py-2"><div className="text-[10px] uppercase tracking-[0.16em] text-white/35">P/L</div><div className="mt-1 text-lg font-bold text-emerald-300">+35.41</div></div>
                      <div className="rounded-lg border border-white/8 bg-[#171c36] px-3 py-2"><div className="text-[10px] uppercase tracking-[0.16em] text-white/35">Stake</div><div className="mt-1 text-lg font-bold text-white">218.00</div></div>
                      <div className="rounded-lg border border-white/8 bg-[#171c36] px-3 py-2"><div className="text-[10px] uppercase tracking-[0.16em] text-white/35">Margin</div><div className="mt-1 text-lg font-bold text-white">16.2%</div></div>
                    </div>
                    <div className="mt-3 overflow-x-auto rounded-xl border border-white/8">
                      <table className="min-w-[38rem] divide-y divide-white/8 text-left text-[11px] text-white/72 sm:min-w-full">
                        <thead className="bg-white/[0.03] text-[10px] uppercase tracking-[0.14em] text-white/35">
                          <tr>
                            <th className="px-3 py-2">Date</th>
                            <th className="px-3 py-2">Match</th>
                            <th className="px-3 py-2">Selection</th>
                            <th className="px-3 py-2 text-right">Odds</th>
                            <th className="px-3 py-2 text-right">Stake</th>
                            <th className="px-3 py-2 text-right">Profit</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/8">
                          {bettingSnapshot.h2h.slice(0, 3).map((row, index) => (
                            <tr key={`${row.match}-${row.result}-${index}`}>
                              <td className="px-3 py-2">{formatShortDate(row.date)}</td>
                              <td className="px-3 py-2">{row.match}</td>
                              <td className="px-3 py-2">{row.result}</td>
                              <td className="px-3 py-2 text-right">{formatNumber(row.bestPrice, 2)}</td>
                              <td className="px-3 py-2 text-right">{10 + index * 14}</td>
                              <td className={`px-3 py-2 text-right font-semibold ${index % 2 === 0 ? "text-emerald-300" : "text-rose-400"}`}>{index % 2 === 0 ? "+" : "-"}{(index + 1) * 12}.00</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </PreviewFrame>
            </LandingCarousel>
          </FeatureSection>

          </LandingSuiteTabs>
        </section>
      </div>
    </div>
  )
}
