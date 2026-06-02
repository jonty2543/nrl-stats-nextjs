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
      className="inline-flex items-center rounded-md border border-nrl-border bg-[#1b2444] px-3 py-1.5 text-xs font-semibold text-nrl-muted transition-colors hover:border-nrl-accent/40 hover:bg-[#202a4d] hover:text-nrl-accent"
    >
      {label}
      {isPending ? (
        <span className="ml-2 h-3 w-3 animate-spin rounded-full border-2 border-nrl-accent/25 border-t-nrl-accent" />
      ) : null}
    </Link>
  )
}
