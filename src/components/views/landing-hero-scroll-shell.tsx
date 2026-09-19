"use client"

import { useEffect, useRef, type ReactNode } from "react"
import styles from "./landing-motion.module.css"

interface LandingHeroScrollShellProps {
  children: ReactNode
}

export function LandingHeroScrollShell({ children }: LandingHeroScrollShellProps) {
  const root = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const elements = root.current?.querySelectorAll<HTMLElement>("[data-landing-reveal]")
    if (!elements || !window.IntersectionObserver) return
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.setAttribute("data-visible", "true")
          observer.unobserve(entry.target)
        }
      })
    }, { threshold: 0.08 })
    elements.forEach((element) => {
      // Keep server-rendered content visible until observation is available.
      element.setAttribute("data-visible", "false")
      observer.observe(element)
    })
    return () => observer.disconnect()
  }, [])

  return (
    <div ref={root} className={styles.landing}>
      {children}
    </div>
  )
}
