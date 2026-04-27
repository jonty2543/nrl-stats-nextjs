"use client"

import type { ReactNode } from "react"

interface LandingHeroScrollShellProps {
  children: ReactNode
}

export function LandingHeroScrollShell({ children }: LandingHeroScrollShellProps) {
  return (
    <div className="home-hero-interactive-bg">
      {children}
    </div>
  )
}
