export default function DashboardLoading() {
  return (
    <div className="rounded-lg border border-nrl-accent/30 bg-nrl-panel p-3 text-center text-sm text-nrl-accent">
      <div className="inline-flex items-center gap-2">
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-nrl-accent/30 border-t-nrl-accent" />
        <span>Loading section...</span>
      </div>
    </div>
  );
}

