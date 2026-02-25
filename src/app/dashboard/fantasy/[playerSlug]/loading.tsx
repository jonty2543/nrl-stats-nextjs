export default function FantasyPlayerLoading() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <span
        aria-label="Loading"
        role="status"
        className="h-10 w-10 animate-spin rounded-full border-[3px] border-nrl-accent/25 border-t-nrl-accent"
      />
    </div>
  )
}
