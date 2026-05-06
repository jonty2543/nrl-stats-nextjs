"use client"

import Link from "next/link"
import { useState } from "react"

export function FantasyBackLink() {
  const [isPending, setIsPending] = useState(false)

  return (
    <Link
      href="/dashboard/fantasy"
      onClick={() => setIsPending(true)}
      className="inline-flex items-center rounded-md border border-nrl-border bg-nrl-panel px-3 py-1.5 text-xs font-semibold text-nrl-muted transition-colors hover:border-nrl-accent/40 hover:text-nrl-accent"
    >
      Back to Fantasy Dashboard
      {isPending ? (
        <span className="ml-2 h-3 w-3 animate-spin rounded-full border-2 border-nrl-muted/30 border-t-nrl-accent" />
      ) : null}
    </Link>
  )
}
