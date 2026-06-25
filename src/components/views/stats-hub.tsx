import Link from "next/link";
import type { StatsHubInsight, StatsHubModel } from "@/lib/data/stats-hub";
import type { PlayerImageRecord } from "@/lib/supabase/queries";
import { ImageWithFallback } from "@/components/ui/image-with-fallback";
import { playerSlug } from "@/lib/data/player-slug";

interface StatsHubProps {
  model: StatsHubModel;
  playerImages: PlayerImageRecord[];
  teamLogos: Record<string, string>;
}

function normaliseKey(value: string | null | undefined): string {
  return String(value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function parseName(value: string): { first: string; last: string } {
  const parts = normaliseKey(value).split(" ").filter(Boolean);
  return { first: parts[0] ?? "", last: parts[parts.length - 1] ?? "" };
}

function playerImageSources(insight: StatsHubInsight, playerImages: PlayerImageRecord[]): string[] {
  if (insight.entityType !== "player") return [];
  const target = normaliseKey(insight.entityName);
  const parsedTarget = parseName(insight.entityName);
  const team = normaliseKey(insight.team);
  const matches = playerImages
    .filter((row) => {
      const player = normaliseKey(row.player);
      if (!player) return false;
      if (player === target) return true;
      const parsed = parseName(row.player);
      return parsed.last === parsedTarget.last && parsed.first[0] === parsedTarget.first[0];
    })
    .sort((a, b) => {
      const aTeam = team && normaliseKey(a.team) === team;
      const bTeam = team && normaliseKey(b.team) === team;
      if (aTeam !== bTeam) return aTeam ? -1 : 1;
      return (b.last_seen_match_date ?? "").localeCompare(a.last_seen_match_date ?? "");
    });

  return matches
    .flatMap((row) => [row.cached_body_image, row.cached_head_image, row.body_image, row.head_image])
    .filter((source): source is string => Boolean(source));
}

function teamLogoSources(insight: StatsHubInsight, teamLogos: Record<string, string>): string[] {
  if (insight.entityType !== "team" || !insight.team) return [];
  const team = insight.team;
  return [
    teamLogos[team],
    teamLogos[normaliseKey(team)],
    teamLogos[team.toLowerCase()],
  ].filter((source): source is string => Boolean(source));
}

function InsightCard({
  insight,
  playerImages,
  teamLogos,
}: {
  insight: StatsHubInsight;
  playerImages: PlayerImageRecord[];
  teamLogos: Record<string, string>;
}) {
  const imageSources = insight.entityType === "player"
    ? playerImageSources(insight, playerImages)
    : teamLogoSources(insight, teamLogos);
  const isMetricCard = insight.visualMode === "metric" && insight.metrics && insight.metrics.length > 0;
  const primaryMetric = insight.metrics?.[2] ?? insight.metrics?.[0] ?? null;
  const firstMetric = insight.metrics?.[0] ?? null;
  const secondMetric = insight.metrics?.[1] ?? null;
  const playerHref = insight.entityType === "player" ? `/dashboard/players/${playerSlug(insight.entityName)}` : null;

  return (
    <article className="flex gap-3 rounded-lg border border-nrl-border bg-nrl-panel px-4 py-3 shadow-[0_18px_40px_rgba(0,0,0,0.22)]">
      <div className={`grid w-14 shrink-0 place-items-center overflow-hidden rounded-lg border border-nrl-border bg-nrl-panel-2 ${isMetricCard ? "self-stretch" : "h-14"}`}>
        <ImageWithFallback
          sources={imageSources}
          alt={insight.entityName}
          className={insight.entityType === "player" ? "h-full w-full object-cover object-top" : "h-12 w-12 object-contain"}
        />
      </div>
      <div className="min-w-0 flex-1">
        <h3 className="text-xs font-black leading-tight text-nrl-text">
          {playerHref ? (
            <Link href={playerHref} className="transition-colors hover:text-nrl-accent">
              {isMetricCard ? insight.entityName : insight.title}
            </Link>
          ) : (
            isMetricCard ? insight.entityName : insight.title
          )}
        </h3>
        {isMetricCard ? (
          <div className="mt-1.5 px-0 py-1">
            {primaryMetric ? (
              <div className={`text-lg font-black leading-tight ${primaryMetric.tone === "up" ? "text-[#58e3a6]" : primaryMetric.tone === "down" ? "text-[#f0b36a]" : "text-nrl-text"}`}>
                {primaryMetric.tone === "up" ? "↑ " : primaryMetric.tone === "down" ? "↓ " : ""}
                {primaryMetric.value}
              </div>
            ) : null}
            {firstMetric && secondMetric ? (
              <div className="mt-2.5 grid grid-cols-2 gap-2">
                {[firstMetric, secondMetric].map((metric) => (
                  <div key={`${insight.id}-${metric.label}`} className="min-w-0 rounded border border-nrl-border/80 px-2 py-1">
                    <div className="truncate text-[7px] font-black uppercase tracking-[0.12em] text-nrl-muted">
                      {metric.label}
                    </div>
                    <div className="mt-0.5 truncate text-[10px] font-black leading-tight text-nrl-text">
                      {metric.value}
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        ) : (
          <p className="mt-2 text-[10px] leading-relaxed text-nrl-muted">{insight.detail}</p>
        )}
      </div>
    </article>
  );
}

function EmptyState() {
  return (
    <div className="rounded-lg border border-nrl-border bg-nrl-panel p-6 text-center">
      <div className="text-[10px] font-black text-nrl-text">No insights generated yet.</div>
      <p className="mt-2 text-[8px] text-nrl-muted">The hub needs completed player and team stats for the latest round.</p>
    </div>
  );
}

export function StatsHub({ model, playerImages, teamLogos }: StatsHubProps) {
  const hasInsights = model.insights.length > 0;

  return (
    <div className="space-y-4">
      {!hasInsights ? <EmptyState /> : null}

      {model.categories.map((group) => (
        <section key={group.category} className="rounded-xl border border-nrl-border bg-nrl-panel p-3">
          <div className="mb-3 flex items-center justify-between gap-3 px-1">
            <h2 className="text-[10px] font-black uppercase tracking-wide text-nrl-accent">{group.category}</h2>
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {group.insights.map((insight) => (
              <InsightCard key={insight.id} insight={insight} playerImages={playerImages} teamLogos={teamLogos} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
