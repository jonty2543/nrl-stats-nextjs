"use client";

import { SignInButton, SignedIn, SignedOut, UserButton } from "@clerk/nextjs";
import Image from "next/image";
import Link from "next/link";
import { BillingNavButton } from "@/components/billing/billing-action-button";
import { TabNav } from "@/components/ui/tab-nav";
import { ToolNav } from "@/components/ui/tool-nav";

interface AppHeaderProps {
  sticky?: boolean;
  showBillingNav?: boolean;
  showStatsTabs?: boolean;
  className?: string;
}

export function AppHeader({
  sticky = false,
  showBillingNav = false,
  showStatsTabs = false,
  className = "",
}: AppHeaderProps) {
  return (
    <header className={`${sticky ? "sticky top-0 z-50 backdrop-blur" : ""} bg-[#111733]/86 ${className}`.trim()}>
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="relative flex items-center justify-between gap-4 border-b border-white/8 pb-4 pt-6">
          <Link href="/" className="relative z-10 inline-flex min-w-0 items-center gap-3">
            <Image src="/logo-mark.svg" alt="Short Side logo" width={30} height={30} priority />
            <div className="min-w-0">
              <div className="truncate text-lg font-semibold text-white/92 sm:text-xl">
                Short Side
              </div>
            </div>
          </Link>

          <div className="pointer-events-none absolute inset-y-0 left-[calc(50%+3rem)] hidden -translate-x-1/2 lg:flex lg:items-center">
            <ToolNav className="pointer-events-auto w-[62rem] max-w-[62rem] pb-0" />
          </div>

          <div className="relative z-10 flex shrink-0 items-center gap-2">
            <SignedIn>
              {showBillingNav ? <BillingNavButton /> : null}
              <UserButton
                appearance={{
                  elements: {
                    avatarBox: "h-8 w-8 ring-1 ring-white/10 sm:h-9 sm:w-9",
                  },
                }}
              />
            </SignedIn>
            <SignedOut>
              <SignInButton mode="modal">
                <button
                  type="button"
                  className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-white/80 transition-colors hover:border-white/20 hover:text-white sm:px-4 sm:py-2 sm:text-sm"
                >
                  Sign in
                </button>
              </SignInButton>
            </SignedOut>
          </div>
        </div>

        <div className="mt-3 lg:hidden">
          <ToolNav />
        </div>
        {showStatsTabs ? <TabNav /> : null}
      </div>
    </header>
  );
}
