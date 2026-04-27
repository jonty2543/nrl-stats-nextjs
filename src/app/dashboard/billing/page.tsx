import Link from "next/link";
import { auth, currentUser } from "@clerk/nextjs/server";
import { BillingActionButton } from "@/components/billing/billing-action-button";
import {
  hasPremiumAccessFromMetadata,
  hasProAccessFromMetadata,
} from "@/lib/access/pro-access";
import { AI_CHAT_QUOTAS, type AiPlan } from "@/lib/ai/access";

interface BillingPageProps {
  searchParams: Promise<{
    billing?: string;
  }>;
}

type PlanTone = "default" | "featured";

function statusMessage(billingStatus: string | undefined) {
  if (billingStatus === "success") {
    return {
      className: "border-nrl-accent/40 bg-nrl-accent/10 text-nrl-text",
      title: "Billing updated",
      body: "Your Stripe checkout completed successfully.",
    };
  }

  if (billingStatus === "cancelled") {
    return {
      className: "border-nrl-border bg-nrl-panel-2 text-nrl-muted",
      title: "Checkout cancelled",
      body: "No changes were made to your subscription.",
    };
  }

  return null;
}

function CheckItem({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2.5 text-[11px] leading-5 text-nrl-muted sm:text-sm">
      <span className="mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-nrl-accent/30 bg-nrl-accent/10 text-[10px] font-bold text-nrl-accent sm:h-5 sm:w-5 sm:text-xs">
        ✓
      </span>
      <span>{children}</span>
    </li>
  );
}

function formatAiQuota(plan: AiPlan): string {
  const quota = AI_CHAT_QUOTAS[plan];
  return quota.limit == null
    ? "Unlimited AI messages"
    : `${quota.limit} AI message${quota.limit === 1 ? "" : "s"} per ${quota.periodLabel}`;
}

function PlanCard({
  title,
  price,
  suffix,
  priceClassName,
  priceRowClassName,
  description,
  features,
  tone = "default",
  cta,
}: {
  title: string;
  price: string;
  suffix?: string;
  priceClassName?: string;
  priceRowClassName?: string;
  description: string;
  features: string[];
  tone?: PlanTone;
  cta: React.ReactNode;
}) {
  const isFeatured = tone === "featured";

  return (
    <article
      className={`grid min-w-0 grid-rows-[auto_auto_auto_1fr_auto] rounded-[24px] border p-4 shadow-[0_18px_40px_rgba(0,0,0,0.18)] sm:p-6 ${
        isFeatured
          ? "border-[#7a5cff] bg-[linear-gradient(180deg,rgba(28,23,49,0.98),rgba(14,18,34,1))]"
          : "border-nrl-border bg-[linear-gradient(180deg,rgba(27,32,54,0.94),rgba(17,21,38,1))]"
      }`}
    >
      <div className="text-center text-xl font-semibold text-nrl-text sm:text-3xl">{title}</div>

      <div
        className={`mt-4 flex min-h-[52px] justify-center gap-1 text-nrl-text sm:min-h-[72px] ${
          priceRowClassName ?? "items-end"
        }`}
      >
        <span
          className={`whitespace-nowrap font-bold tracking-tight ${priceClassName ?? "text-4xl sm:text-6xl"}`}
        >
            {price}
        </span>
        {suffix ? (
          <span className="pb-1 text-xs text-nrl-muted sm:text-base">{suffix}</span>
        ) : null}
      </div>

      <div className="mt-3 min-h-[44px] text-[11px] leading-5 text-nrl-muted sm:min-h-[56px] sm:text-sm">
        {description}
      </div>

      <ul className="mt-6 space-y-3 self-start sm:mt-8 sm:space-y-4">
        {features.map((feature) => (
          <CheckItem key={feature}>{feature}</CheckItem>
        ))}
      </ul>

      <div className="pt-6 sm:pt-8">{cta}</div>
    </article>
  );
}

export default async function BillingPage({ searchParams }: BillingPageProps) {
  const [{ userId }, user, resolvedSearchParams] = await Promise.all([
    auth(),
    currentUser(),
    searchParams,
  ]);

  const publicMetadata = user?.publicMetadata;
  const hasStripeManagedPro = hasProAccessFromMetadata(publicMetadata);
  const hasStripeManagedPremium = hasPremiumAccessFromMetadata(publicMetadata);
  const banner = statusMessage(resolvedSearchParams.billing);
  const currentPlan = hasStripeManagedPremium ? "premium" : hasStripeManagedPro ? "pro" : "free";

  return (
    <div className="space-y-6">
      {banner ? (
        <section className={`rounded-xl border px-4 py-3 ${banner.className}`}>
          <div className="text-sm font-semibold">{banner.title}</div>
          <div className="mt-1 text-sm">{banner.body}</div>
        </section>
      ) : null}

      <section className="rounded-[28px] border border-nrl-border bg-[radial-gradient(circle_at_top,rgba(122,92,255,0.12),transparent_30%),linear-gradient(180deg,rgba(25,31,56,0.98),rgba(13,17,32,1))] px-3 py-8 sm:px-5 sm:py-10">
        <div className="mx-auto max-w-7xl">
          <div className="text-center">
            <div className="inline-flex rounded-full border border-nrl-border bg-nrl-panel/80 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-nrl-muted">
              Billing
            </div>
            <h1 className="mt-4 text-3xl font-bold tracking-tight text-nrl-text sm:text-5xl">
              Simple, transparent pricing
            </h1>
            <p className="mx-auto mt-4 max-w-3xl text-sm leading-6 text-nrl-muted sm:text-base">
              Choose the tier that matches how deep you want to go. Free covers the core product.
              Pro unlocks paid stats access plus higher AI usage, fantasy projections, and breakevens.
              Premium adds deeper AI reasoning plus premium-only betting model info, line odds, and total odds.
            </p>
          </div>

          <div className="mt-8 overflow-x-auto pb-2">
            <div className="grid min-w-[960px] grid-cols-3 gap-4 lg:gap-6">
              <PlanCard
                title="Free"
                price="$0"
                description="The base tier for exploring the app before you upgrade."
                features={[
                  "Core app access",
                  "Current free stats access",
                  "Standard dashboards and browsing tools",
                  formatAiQuota("free"),
                  "Upgrade path to Pro when you want full history and locked features",
                ]}
                cta={
                  currentPlan === "free" ? (
                    <div className="flex h-11 items-center justify-center rounded-xl border border-nrl-border bg-nrl-panel-2 text-sm font-semibold text-nrl-muted">
                      {userId ? "Current plan" : "Free plan"}
                    </div>
                  ) : hasStripeManagedPro ? (
                    <BillingActionButton
                      action="portal"
                      className="flex h-11 w-full items-center justify-center rounded-xl border border-nrl-border bg-nrl-panel-2 text-sm font-semibold text-nrl-muted transition-colors hover:border-nrl-accent hover:text-nrl-text"
                    >
                      Downgrade to Free
                    </BillingActionButton>
                  ) : (
                    <Link
                      href="/dashboard/fantasy"
                      className="flex h-11 items-center justify-center rounded-xl border border-nrl-border bg-nrl-panel-2 text-sm font-semibold text-nrl-muted transition-colors hover:border-nrl-accent hover:text-nrl-text"
                    >
                      Continue browsing
                    </Link>
                  )
                }
              />

              <PlanCard
                title="Pro"
                price="$5"
                suffix="/month"
                description="All paid access available today starts here."
                tone="featured"
                features={[
                  "Everything in Free",
                  formatAiQuota("pro"),
                  "All plots unlocked in Fantasy and Stats",
                  "Fantasy projections and breakevens in AI",
                  "Full stats years",
                  "New features as they release",
                ]}
                cta={
                  currentPlan === "pro" ? (
                    <div className="flex h-11 items-center justify-center rounded-xl border border-[#7a5cff] bg-[linear-gradient(135deg,rgba(111,76,255,0.18),rgba(141,92,255,0.18))] text-sm font-semibold text-white">
                      Current plan
                    </div>
                  ) : currentPlan === "premium" ? (
                    <div className="flex h-11 items-center justify-center rounded-xl border border-[#7a5cff]/40 bg-[linear-gradient(135deg,rgba(111,76,255,0.12),rgba(141,92,255,0.12))] text-sm font-semibold text-white/80">
                      Included in Premium
                    </div>
                  ) : (
                    <BillingActionButton
                      action="checkout"
                      className="flex h-11 w-full items-center justify-center rounded-xl bg-[linear-gradient(135deg,#6f4cff,#8d5cff)] text-sm font-semibold text-white shadow-[0_10px_30px_rgba(111,76,255,0.35)] transition-transform hover:scale-[1.01]"
                    >
                      Upgrade to Pro
                    </BillingActionButton>
                  )
                }
              />

              <PlanCard
                title="Premium"
                price="Coming Soon"
                priceClassName="text-2xl sm:text-4xl"
                priceRowClassName="items-center"
                description="The future top tier above Pro for premium-only capabilities."
                features={[
                  "Everything in Pro",
                  formatAiQuota("premium"),
                  "Betting model predictions, line and total odds",
                  "Bet tracker with history",
                  "Discord alerting",
                ]}
                cta={
                  <div className="flex h-11 items-center justify-center rounded-xl border border-nrl-border bg-nrl-panel-2 text-sm font-semibold text-nrl-muted">
                    {currentPlan === "premium" ? "Current plan" : "Premium coming soon"}
                  </div>
                }
              />
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
