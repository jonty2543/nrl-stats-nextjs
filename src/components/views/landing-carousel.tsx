"use client"

import { Children, useMemo, useState, type ReactNode } from "react"

interface LandingCarouselProps {
  children: ReactNode
}

export function LandingCarousel({ children }: LandingCarouselProps) {
  const slides = useMemo(() => Children.toArray(children), [children])
  const [activeIndex, setActiveIndex] = useState(0)

  if (slides.length === 0) {
    return null
  }

  const safeActiveIndex = activeIndex % slides.length

  const goToPrevious = () => {
    setActiveIndex((current) => (current - 1 + slides.length) % slides.length)
  }

  const goToNext = () => {
    setActiveIndex((current) => (current + 1) % slides.length)
  }

  return (
    <div className="space-y-3">
      <div className="relative overflow-hidden rounded-xl border border-white/10 bg-[#0f1428]/90 sm:rounded-2xl">
        <div
          className="flex items-stretch transition-transform duration-500 ease-out"
          style={{ transform: `translateX(-${safeActiveIndex * 100}%)` }}
        >
          {slides.map((slide, index) => (
            <div key={index} className="h-full w-full shrink-0">
              {slide}
            </div>
          ))}
        </div>

        {slides.length > 1 ? (
          <>
            <button
              type="button"
              onClick={goToPrevious}
              aria-label="Previous preview"
              className="absolute left-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-white/12 bg-[#0b1020]/80 text-sm text-white/80 backdrop-blur transition-colors hover:border-white/20 hover:text-white sm:left-3 sm:h-9 sm:w-9"
            >
              <span aria-hidden="true">←</span>
            </button>
            <button
              type="button"
              onClick={goToNext}
              aria-label="Next preview"
              className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-white/12 bg-[#0b1020]/80 text-sm text-white/80 backdrop-blur transition-colors hover:border-white/20 hover:text-white sm:right-3 sm:h-9 sm:w-9"
            >
              <span aria-hidden="true">→</span>
            </button>
          </>
        ) : null}
      </div>

      {slides.length > 1 ? (
        <div className="flex items-center justify-center gap-2">
          {slides.map((_, index) => {
            const active = index === safeActiveIndex
            return (
              <button
                key={index}
                type="button"
                aria-label={`Show preview ${index + 1}`}
                onClick={() => setActiveIndex(index)}
                className={`h-2.5 rounded-full transition-all ${active ? "w-8 bg-nrl-accent" : "w-2.5 bg-white/20 hover:bg-white/35"}`}
              />
            )
          })}
        </div>
      ) : null}
    </div>
  )
}
