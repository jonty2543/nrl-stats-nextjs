import { UserButton } from "@clerk/nextjs";
import Link from "next/link";
import Image from "next/image";
import { TabNav } from "@/components/ui/tab-nav";

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
            <div className="flex items-center gap-8">
              <Link href="/dashboard" className="flex items-center gap-2 text-lg font-bold text-nrl-accent">
                <Image
                  src="/logo-mark.svg"
                  alt="NRL Stats logo"
                  width={28}
                  height={28}
                  priority
                />
                <span>NRL Stats</span>
              </Link>
              <TabNav />
            </div>
            <UserButton
              appearance={{
                elements: {
                  avatarBox: "h-8 w-8",
                },
              }}
            />
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
