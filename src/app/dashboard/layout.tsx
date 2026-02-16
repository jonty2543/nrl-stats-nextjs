import { SignInButton, SignedIn, SignedOut, UserButton } from "@clerk/nextjs";
import Link from "next/link";
import Image from "next/image";
import { TabNav } from "@/components/ui/tab-nav";
import { ToolNav } from "@/components/ui/tool-nav";
import { ThemeToggle } from "@/components/ui/theme-toggle";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="border-b border-nrl-border bg-nrl-panel/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-14 items-center justify-between">
            <div className="flex items-center gap-3">
              <Link href="/dashboard" className="flex items-center gap-2 text-lg font-bold text-nrl-accent">
                <Image
                  src="/logo-mark.svg"
                  alt="Short Side Stats logo"
                  width={28}
                  height={28}
                  priority
                />
                <span>Short Side</span>
              </Link>
              <ToolNav />
              <TabNav />
            </div>
            <div className="flex items-center gap-2">
              <ThemeToggle />
              <SignedIn>
                <UserButton
                  appearance={{
                    elements: {
                      avatarBox: "h-8 w-8",
                    },
                  }}
                />
              </SignedIn>
              <SignedOut>
                <SignInButton mode="modal">
                  <button
                    type="button"
                    className="cursor-pointer rounded-md border border-nrl-border bg-nrl-panel-2 px-2.5 py-1 text-xs font-semibold text-nrl-muted transition-colors hover:border-nrl-accent hover:text-nrl-text"
                  >
                    Sign in
                  </button>
                </SignInButton>
              </SignedOut>
            </div>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6">
        {children}
      </main>
    </div>
  );
}
