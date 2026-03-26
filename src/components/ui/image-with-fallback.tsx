"use client"

import { useMemo, useState } from "react"

interface ImageWithFallbackProps {
  sources: string[]
  alt: string
  className?: string
}

export function ImageWithFallback({ sources, alt, className }: ImageWithFallbackProps) {
  const uniqueSources = useMemo(() => {
    const seen = new Set<string>()
    const out: string[] = []
    for (const source of sources) {
      const trimmed = source?.trim()
      if (!trimmed || seen.has(trimmed)) continue
      seen.add(trimmed)
      out.push(trimmed)
    }
    return out
  }, [sources])

  const [index, setIndex] = useState(0)
  const activeSource = uniqueSources[index] ?? null

  if (!activeSource) {
    return null
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={activeSource}
      alt={alt}
      className={className}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => {
        setIndex((current) => (current < uniqueSources.length - 1 ? current + 1 : current))
      }}
    />
  )
}
