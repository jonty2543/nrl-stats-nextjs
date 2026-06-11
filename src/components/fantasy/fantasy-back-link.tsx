"use client"

import Link from "next/link"
import { useState } from "react"

interface FantasyBackLinkProps {
  href?: string
  label?: string
}

export function FantasyBackLink({ href = "/dashboard/fantasy", label = "Back to Fantasy Dashboard" }: FantasyBackLinkProps) {
  const [isPending, setIsPending] = useState(false)

  return (
    <Link
      href={href}
      onClick={() => setIsPending(true)}
      aria-label={label}
      title={label}
      className="inline-grid h-9 w-10 place-items-center rounded-md border border-nrl-border bg-[#111832] text-lg font-bold leading-none text-nrl-muted transition-colors hover:border-nrl-accent/40 hover:bg-[#17213d] hover:text-nrl-accent"
    >
      {isPending ? (
        <span className="h-3 w-3 animate-spin rounded-full border-2 border-nrl-accent/25 border-t-nrl-accent" />
      ) : (
        <span aria-hidden="true">←</span>
      )}
    </Link>
  )
}
