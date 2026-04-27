"use client";

import { useAuth, useUser } from "@clerk/nextjs";
import { useCallback, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { BillingPageLink } from "@/components/billing/billing-page-link";
import { hasProPlotAccess } from "@/lib/access/pro-access";

type BillingAction = "auto" | "checkout" | "portal";

interface BillingActionButtonProps {
  action?: BillingAction;
  className?: string;
  children: ReactNode;
  signedOutHref?: string;
}

function useResolvedBillingAction(action: BillingAction) {
  const { userId } = useAuth();
  const { user } = useUser();
  const hasProAccess = hasProPlotAccess(userId, user?.publicMetadata);

  return useMemo(() => {
    if (action !== "auto") return action;
    return hasProAccess ? "portal" : "checkout";
  }, [action, hasProAccess]);
}

export function BillingActionButton({
  action = "auto",
  className,
  children,
  signedOutHref = "/sign-up",
}: BillingActionButtonProps) {
  const { userId } = useAuth();
  const resolvedAction = useResolvedBillingAction(action);
  const [isPending, setIsPending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleClick = useCallback(async () => {
    if (!userId || isPending) return;

    setIsPending(true);
    setErrorMessage(null);
    try {
      const response = await fetch(`/api/stripe/${resolvedAction}`, {
        method: "POST",
      });
      const rawBody = await response.text();
      const payload = (() => {
        if (!rawBody) return null;
        try {
          return JSON.parse(rawBody) as { url?: string; error?: string };
        } catch {
          return null;
        }
      })() as
        | { url?: string; error?: string }
        | null;

      if (response.status === 401) {
        const redirectUrl = encodeURIComponent(window.location.pathname + window.location.search);
        window.location.assign(`/sign-in?redirect_url=${redirectUrl}`);
        return;
      }

      if (!response.ok || !payload?.url) {
        const fallbackMessage = rawBody.trim() || `Unable to start Stripe ${resolvedAction}.`;
        throw new Error(payload?.error ?? fallbackMessage);
      }

      window.location.assign(payload.url);
    } catch (error) {
      console.error(error);
      setErrorMessage(
        error instanceof Error ? error.message : `Unable to start Stripe ${resolvedAction}.`
      );
      setIsPending(false);
    }
  }, [isPending, resolvedAction, userId]);

  if (!userId) {
    return (
      <Link href={signedOutHref} className={className}>
        {children}
      </Link>
    );
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => void handleClick()}
        disabled={isPending}
        className={className}
      >
        {children}
      </button>
      {errorMessage ? <div className="text-xs text-red-400">{errorMessage}</div> : null}
    </div>
  );
}

export function BillingNavButton() {
  const { userId } = useAuth();
  const { user } = useUser();
  const hasProAccess = hasProPlotAccess(userId, user?.publicMetadata);

  if (!userId) return null;

  return (
    <BillingPageLink
      className="inline-flex h-9 cursor-pointer items-center rounded-xl border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[11px] font-semibold text-white/74 transition-colors hover:border-white/16 hover:bg-white/[0.07] hover:text-white sm:h-auto sm:px-3 sm:py-1.5 sm:text-[0.95rem]"
    >
      {hasProAccess ? "Manage" : "Billing"}
    </BillingPageLink>
  );
}
