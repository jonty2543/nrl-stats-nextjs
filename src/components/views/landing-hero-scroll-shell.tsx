"use client"

import { useEffect, useState, type ReactNode } from "react"

interface LandingHeroScrollShellProps {
  children: ReactNode
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export function LandingHeroScrollShell({ children }: LandingHeroScrollShellProps) {
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    let frame = 0

    const updateProgress = () => {
      frame = 0
      const nextProgress = clamp(window.scrollY / 320, 0, 1)
      setProgress((current) => (Math.abs(current - nextProgress) < 0.01 ? current : nextProgress))
    }

    const onScroll = () => {
      if (frame !== 0) return
      frame = window.requestAnimationFrame(updateProgress)
    }

    updateProgress()
    window.addEventListener("scroll", onScroll, { passive: true })
    window.addEventListener("resize", onScroll)

    return () => {
      if (frame !== 0) {
        window.cancelAnimationFrame(frame)
      }
      window.removeEventListener("scroll", onScroll)
      window.removeEventListener("resize", onScroll)
    }
  }, [])

  return (
    <div
      className="will-change-transform"
      style={{
        opacity: 1 - progress,
        transform: `translate3d(0, ${progress * -48}px, 0) scale(${1 - progress * 0.05})`,
        filter: `blur(${progress * 8}px)`,
        pointerEvents: progress > 0.92 ? "none" : "auto",
      }}
    >
      {children}
    </div>
  )
}
