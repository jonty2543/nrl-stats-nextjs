"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@clerk/nextjs";

function buildBillingPath(billingStatus: string | null): string {
  return billingStatus ? `/dashboard/billing?billing=${encodeURIComponent(billingStatus)}` : "/dashboard/billing";
}

export default function BillingReturnPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isLoaded, userId } = useAuth();
  const billingStatus = searchParams.get("billing");

  useEffect(() => {
    if (!isLoaded) return;

    const nextPath = buildBillingPath(billingStatus);
    if (userId) {
      router.replace(nextPath);
      return;
    }

    window.location.assign(`/sign-in?redirect_url=${encodeURIComponent(nextPath)}`);
  }, [billingStatus, isLoaded, router, userId]);

  return (
    <div className="mx-auto max-w-xl rounded-2xl border border-nrl-border bg-nrl-panel p-6 text-center">
      <div className="text-sm font-semibold text-nrl-text">Restoring billing session</div>
      <div className="mt-2 text-sm text-nrl-muted">
        {isLoaded ? "Redirecting you back into billing." : "Waiting for sign-in state to load."}
      </div>
    </div>
  );
}
