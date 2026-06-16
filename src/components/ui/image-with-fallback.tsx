"use client"

import { useMemo, useState } from "react"

interface ImageWithFallbackProps {
  sources: string[]
  alt: string
  className?: string
}

function upgradeHttpSource(source: string): string {
  return source.startsWith("http://") ? `https://${source.slice("http://".length)}` : source
}

function encodeImageSource(source: string): string {
  return encodeURI(source).replace(/'/g, "%27")
}

function decodeImageSource(source: string): string {
  try {
    return decodeURIComponent(source)
  } catch {
    return source
  }
}

function imageSourceCandidates(value: string): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  const push = (source: string | null | undefined) => {
    const normalised = source ? encodeImageSource(upgradeHttpSource(source.trim())) : ""
    if (!normalised || seen.has(normalised)) return
    seen.add(normalised)
    out.push(normalised)
  }

  const trimmed = value.trim()
  const decoded = decodeImageSource(trimmed)
  const marker = "/remote.axd?"
  const markerIndex = trimmed.indexOf(marker)
  if (markerIndex >= 0) {
    const nested = trimmed.slice(markerIndex + marker.length).split("&preset=")[0]
    push(trimmed)
    push(decoded)
    push(decodeImageSource(nested))
    return out
  }

  push(decoded)
  push(trimmed)
  return out
}

export function ImageWithFallback({ sources, alt, className }: ImageWithFallbackProps) {
  const uniqueSources = useMemo(() => {
    const seen = new Set<string>()
    const out: string[] = []
    for (const source of sources) {
      const trimmed = source?.trim()
      if (!trimmed || seen.has(trimmed)) continue
      for (const normalised of imageSourceCandidates(trimmed)) {
        if (seen.has(normalised)) continue
        seen.add(normalised)
        out.push(normalised)
      }
    }
    return out
  }, [sources])

  const sourceSignature = uniqueSources.join("|")
  const [state, setState] = useState({ signature: sourceSignature, index: 0 })
  const index = state.signature === sourceSignature ? state.index : 0
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
        setState((current) => {
          const baseIndex = current.signature === sourceSignature ? current.index : 0
          const nextIndex = baseIndex < uniqueSources.length - 1 ? baseIndex + 1 : baseIndex
          return {
            signature: sourceSignature,
            index: nextIndex,
          }
        })
      }}
    />
  )
}
