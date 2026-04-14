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
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    let frame = 0
    let revealFrame = 0

    const isDesktop = () => window.innerWidth >= 1024

    const updateProgress = () => {
      frame = 0
      if (!isDesktop()) {
        setProgress(0)
        return
      }
      const nextProgress = clamp(window.scrollY / 320, 0, 1)
      setProgress((current) => (Math.abs(current - nextProgress) < 0.01 ? current : nextProgress))
    }

    const onScroll = () => {
      if (frame !== 0) return
      frame = window.requestAnimationFrame(updateProgress)
    }

    revealFrame = window.requestAnimationFrame(() => {
      setIsVisible(true)
    })
    updateProgress()
    window.addEventListener("scroll", onScroll, { passive: true })
    window.addEventListener("resize", onScroll)

    return () => {
      if (revealFrame !== 0) {
        window.cancelAnimationFrame(revealFrame)
      }
      if (frame !== 0) {
        window.cancelAnimationFrame(frame)
      }
      window.removeEventListener("scroll", onScroll)
      window.removeEventListener("resize", onScroll)
    }
  }, [])

  return (
    <div
      className="will-change-transform transition-[opacity,transform,filter] duration-700 ease-out"
      style={{
        opacity: isVisible ? 1 - progress : 0,
        transform: `translate3d(0, ${progress * -48 + (isVisible ? 0 : 24)}px, 0) scale(${(isVisible ? 1 : 0.98) - progress * 0.05})`,
        filter: `blur(${progress * 8 + (isVisible ? 0 : 10)}px)`,
        pointerEvents: progress > 0.92 ? "none" : "auto",
      }}
    >
      {children}
    </div>
  )
}
