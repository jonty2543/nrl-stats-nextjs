"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@clerk/nextjs";

function buildBillingPath(billingStatus: string | null, billingPlan: string | null): string {
  const params = new URLSearchParams();
  if (billingStatus) params.set("billing", billingStatus);
  if (billingPlan) params.set("plan", billingPlan);
  const query = params.toString();

  return query ? `/dashboard/billing?${query}` : "/dashboard/billing";
}

export default function BillingReturnPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isLoaded, userId } = useAuth();
  const [authGraceExpired, setAuthGraceExpired] = useState(false);
  const billingStatus = searchParams.get("billing");
  const billingPlan = searchParams.get("plan");

  useEffect(() => {
    if (!isLoaded || userId) {
      return;
    }

    const timerId = window.setTimeout(() => {
      setAuthGraceExpired(true);
    }, 2500);

    return () => {
      window.clearTimeout(timerId);
    };
  }, [isLoaded, userId]);

  useEffect(() => {
    if (!isLoaded) return;

    const nextPath = buildBillingPath(billingStatus, billingPlan);
    if (userId) {
      router.replace(nextPath);
      return;
    }

    if (!authGraceExpired) return;
    window.location.assign(`/sign-in?redirect_url=${encodeURIComponent(nextPath)}`);
  }, [authGraceExpired, billingPlan, billingStatus, isLoaded, router, userId]);

  return (
    <div className="mx-auto max-w-xl rounded-2xl border border-nrl-border bg-nrl-panel p-6 text-center">
      <div className="text-sm font-semibold text-nrl-text">Restoring billing session</div>
      <div className="mt-2 text-sm text-nrl-muted">
        {isLoaded ? "Redirecting you back into billing." : "Waiting for sign-in state to load."}
      </div>
    </div>
  );
}
