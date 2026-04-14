"use client"

import { Children, useEffect, useMemo, useRef, useState, type ReactNode } from "react"

interface LandingSuiteTabsProps {
  labels: string[]
  children: ReactNode
}

export function LandingSuiteTabs({ labels, children }: LandingSuiteTabsProps) {
  const sections = useMemo(() => Children.toArray(children), [children])
  const safeLabels = labels.slice(0, sections.length)
  const [activeIndex, setActiveIndex] = useState(0)
  const [visibleIndices, setVisibleIndices] = useState<Record<number, boolean>>({ 0: true })
  const sectionRefs = useRef<Array<HTMLDivElement | null>>([])
  const ratiosRef = useRef(new Map<number, number>())
  const visibilityRef = useRef(new Map<number, boolean>())

  const clampedIndex = Math.min(activeIndex, sections.length - 1)

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const viewportHeight = window.innerHeight || 0
        const visibleBandTop = viewportHeight * 0.16
        const visibleBandBottom = viewportHeight * 0.84

        for (const entry of entries) {
          const index = Number(entry.target.getAttribute("data-section-index"))
          if (!Number.isFinite(index)) continue

          const isVisible =
            entry.isIntersecting &&
            entry.boundingClientRect.top < visibleBandBottom &&
            entry.boundingClientRect.bottom > visibleBandTop
          visibilityRef.current.set(index, isVisible)

          if (isVisible) {
            ratiosRef.current.set(index, entry.intersectionRatio)
          } else {
            ratiosRef.current.delete(index)
          }
        }

        setVisibleIndices((current) => {
          let changed = false
          const next = { ...current }
          for (const [index, isVisible] of visibilityRef.current.entries()) {
            if (next[index] !== isVisible) {
              next[index] = isVisible
              changed = true
            }
          }
          return changed ? next : current
        })

        const nextActiveIndex = [...ratiosRef.current.entries()]
          .sort((a, b) => b[1] - a[1])[0]?.[0]

        if (typeof nextActiveIndex === "number") {
          setActiveIndex(nextActiveIndex)
        }
      },
      {
        threshold: [0.05, 0.18, 0.35, 0.6],
        rootMargin: "-12% 0px -12% 0px",
      }
    )

    const nodes = sectionRefs.current.filter((node): node is HTMLDivElement => node != null)
    for (const node of nodes) observer.observe(node)

    return () => observer.disconnect()
  }, [sections.length])

  const scrollToSection = (index: number) => {
    setActiveIndex(index)
    sectionRefs.current[index]?.scrollIntoView({ behavior: "smooth", block: "start" })
  }

  if (sections.length === 0) {
    return null
  }

  return (
    <div className="space-y-6 sm:space-y-8">
      <div className="sticky top-3 z-20 -mx-1 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div className="inline-flex min-w-max rounded-full border border-white/10 bg-[#0e1330]/80 p-1 backdrop-blur">
          {safeLabels.map((label, index) => {
            const active = index === clampedIndex
            return (
              <button
                key={label}
                type="button"
                onClick={() => scrollToSection(index)}
                className={`rounded-full px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.16em] transition-colors sm:px-4 sm:text-xs sm:tracking-[0.18em] ${
                  active
                    ? "bg-emerald-400/14 text-emerald-300"
                    : "text-white/48 hover:text-white/78"
                }`}
              >
                {label}
              </button>
            )
          })}
        </div>
      </div>

      <div className="space-y-6 sm:space-y-8">
        {sections.map((section, index) => {
          const isVisible = Boolean(visibleIndices[index])
          return (
            <div
              key={index}
              ref={(node) => {
                sectionRefs.current[index] = node
              }}
              data-section-index={index}
              className={`transition-[opacity,transform,filter] duration-700 ease-out motion-reduce:transform-none motion-reduce:transition-none ${
                isVisible ? "translate-y-0 opacity-100 blur-0" : "translate-y-10 opacity-0 blur-[6px]"
              }`}
            >
              {section}
            </div>
          )
        })}
      </div>
    </div>
  )
}
