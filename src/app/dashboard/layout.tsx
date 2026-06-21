import { AppHeader } from "@/components/layout/app-header";
import { FeedbackPrompt } from "@/components/feedback/feedback-prompt";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="relative overflow-hidden text-nrl-text">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />

      <div className="relative mx-auto flex min-h-screen w-full max-w-7xl flex-col pb-16">
        <AppHeader sticky showBillingNav showStatsTabs />

        <main className="min-h-0 flex-1 px-4 pb-5 pt-2 sm:px-6 sm:pb-6 sm:pt-3 lg:px-8 lg:pb-8 lg:pt-4">
          {children}
        </main>
        <FeedbackPrompt />
      </div>
    </div>
  );
}
