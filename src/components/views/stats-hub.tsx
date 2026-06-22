import type { StatsHubInsight, StatsHubModel } from "@/lib/data/stats-hub";
import type { PlayerImageRecord } from "@/lib/supabase/queries";
import { ImageWithFallback } from "@/components/ui/image-with-fallback";

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

  return matches.flatMap((row) => [row.body_image, row.head_image]).filter((source): source is string => Boolean(source));
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

  return (
    <article className="flex gap-4 rounded-lg border border-nrl-border bg-nrl-panel px-4 py-4 shadow-[0_18px_40px_rgba(0,0,0,0.22)]">
      <div className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-lg border border-nrl-border bg-nrl-panel-2">
        <ImageWithFallback
          sources={imageSources}
          alt={insight.entityName}
          className={insight.entityType === "player" ? "h-full w-full object-cover object-top" : "h-12 w-12 object-contain"}
        />
      </div>
      <div className="min-w-0 flex-1">
        <h3 className="text-[10px] font-black leading-tight text-nrl-text">
          {insight.title}
        </h3>
        {isMetricCard ? (
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            {insight.metrics?.map((metric) => (
              <div key={`${insight.id}-${metric.label}`} className="rounded-md border border-nrl-border bg-nrl-panel-2 px-3 py-2">
                <div className="text-[6px] font-black uppercase tracking-[0.12em] text-nrl-muted">{metric.label}</div>
                <div className={`mt-1 text-[10px] font-black ${metric.tone === "up" ? "text-nrl-accent" : metric.tone === "down" ? "text-orange-300" : "text-nrl-text"}`}>
                  {metric.tone === "up" ? "↑ " : metric.tone === "down" ? "↓ " : ""}
                  {metric.value}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-2 text-[8px] leading-relaxed text-nrl-muted">{insight.detail}</p>
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
      <section className="overflow-hidden rounded-xl border border-nrl-border bg-nrl-panel">
        <div className="border-b border-nrl-border bg-nrl-panel-2 px-4 py-4 sm:px-5">
          <div>
            <h1 className="text-sm font-black uppercase tracking-wide text-nrl-accent sm:text-base">Stats Hub</h1>
            <p className="mt-1 text-[8px] font-semibold text-nrl-muted">
              {model.roundLabel}
              {model.year ? `, ${model.year}` : ""}
            </p>
          </div>
        </div>

        {!hasInsights ? (
          <div className="p-3">
            <EmptyState />
          </div>
        ) : null}
      </section>

      {model.categories.map((group) => (
        <section key={group.category} className="rounded-xl border border-nrl-border bg-nrl-panel p-3">
          <div className="mb-3 flex items-center justify-between gap-3 px-1">
            <h2 className="text-[10px] font-black uppercase tracking-wide text-nrl-accent">{group.category}</h2>
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {group.insights.length > 0 ? (
              group.insights.map((insight) => (
                <InsightCard key={insight.id} insight={insight} playerImages={playerImages} teamLogos={teamLogos} />
              ))
            ) : (
              <div className="rounded-lg border border-dashed border-nrl-border bg-nrl-panel-2 p-4 text-[8px] text-nrl-muted">
                No standout generated insight for this section in the latest round.
              </div>
            )}
          </div>
        </section>
      ))}
    </div>
  );
}
