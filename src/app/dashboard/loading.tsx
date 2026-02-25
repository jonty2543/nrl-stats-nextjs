export default function DashboardLoading() {
  return (
    <div className="flex justify-center pt-10 md:pt-14">
      <span
        aria-label="Loading"
        role="status"
        className="h-10 w-10 animate-spin rounded-full border-[3px] border-nrl-accent/25 border-t-nrl-accent"
      />
    </div>
  )
}
