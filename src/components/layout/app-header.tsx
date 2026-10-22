"use client";

import { SignInButton, SignedIn, SignedOut, UserButton } from "@clerk/nextjs";
import Image from "next/image";
import Link from "next/link";
import { useSyncExternalStore } from "react";
import { BillingNavButton } from "@/components/billing/billing-action-button";
import { ToolNav } from "@/components/ui/tool-nav";

const subscribeToHydration = () => () => {};
const clientSnapshot = () => true;
const serverSnapshot = () => false;

interface AppHeaderProps {
  sticky?: boolean;
  showBillingNav?: boolean;
  blendBackground?: boolean;
  className?: string;
}

export function AppHeader({
  sticky = false,
  showBillingNav = false,
  blendBackground = false,
  className = "",
}: AppHeaderProps) {
  // Auth can already be loaded in the browser while the server has no session.
  // Keep the account controls identical through the initial hydration render.
  const hydrated = useSyncExternalStore(subscribeToHydration, clientSnapshot, serverSnapshot);

  return (
    <header data-blend-background={blendBackground || undefined} className={`${sticky ? "sticky top-0 z-50" : ""} relative w-full isolate ${className}`.trim()}>
      <div className="relative z-10 border-b border-white/10 bg-nrl-bg/95 text-[#f2f3e9] backdrop-blur-xl">
        <div className="mx-auto max-w-[1480px] px-5 sm:px-[4vw]">
          <div className="grid h-[72px] grid-cols-[1fr_auto] items-center gap-4 lg:h-[84px] lg:grid-cols-[1fr_auto_1fr]">
            <Link href="/" className="relative z-10 inline-flex w-max min-w-0 items-center gap-[11px]">
              <Image src="/logo-mark.svg" alt="" width={42} height={42} priority className="h-[36px] w-[36px] min-[681px]:h-[42px] min-[681px]:w-[42px]" />
              <span className="flex flex-col font-[family-name:var(--font-landing-display)] uppercase">
                <span className="text-[14px] font-extrabold leading-[0.77] min-[681px]:text-[16px]">Short Side</span>
                <strong className="text-[21px] font-bold leading-[0.77] tracking-[0.08em] text-[#00f58a] min-[681px]:text-[24px]">NRL</strong>
              </span>
            </Link>

            <div className="hidden h-full lg:block">
              <ToolNav />
            </div>

            <div className="relative z-10 flex shrink-0 items-center justify-end gap-3">
              <div className="hidden items-baseline gap-2 font-mono uppercase xl:flex">
                <span className="text-[8px] tracking-[0.1em] text-[#f2f3e9]/48">Season</span>
                <strong className="text-xs">2026</strong>
              </div>
              {hydrated ? (
                <>
                  <SignedIn>
                    {showBillingNav ? <BillingNavButton /> : null}
                    <UserButton
                      appearance={{
                        elements: {
                          avatarBox: "h-8 w-8 ring-1 ring-white/15 sm:h-9 sm:w-9",
                        },
                      }}
                    />
                  </SignedIn>
                  <SignedOut>
                    <SignInButton mode="modal">
                      <button
                        type="button"
                        className="border-b border-white/35 px-0 py-2 text-[10px] font-extrabold uppercase tracking-[0.12em] text-[#f2f3e9] transition-colors hover:border-[#00f58a] hover:text-[#00f58a] sm:text-xs"
                      >
                        Sign in <span className="ml-1 text-[#00f58a]">↗</span>
                      </button>
                    </SignInButton>
                  </SignedOut>
                </>
              ) : (
                <div className="h-9 w-20" aria-hidden="true" />
              )}
            </div>
          </div>

          <div className="border-t border-white/10 lg:hidden">
            <ToolNav />
          </div>
        </div>
      </div>
    </header>
  );
}
