"use client"

import { useMemo, useState } from "react"

interface ImageWithFallbackProps {
  sources: string[]
  alt: string
  className?: string
}

function normaliseImageSource(value: string): string {
  const upgradeHttp = (source: string) => source.startsWith("http://") ? `https://${source.slice("http://".length)}` : source
  const encode = (source: string) => encodeURI(source).replace(/'/g, "%27")
  const decode = (source: string) => {
    try {
      return decodeURIComponent(source)
    } catch {
      return source
    }
  }

  const marker = "/remote.axd?"
  const markerIndex = value.indexOf(marker)
  if (markerIndex >= 0) {
    const nested = value.slice(markerIndex + marker.length).split("&preset=")[0]
    const decoded = decode(nested)
    if (decoded) return encode(upgradeHttp(decoded))
  }

  return encode(upgradeHttp(decode(value)))
}

export function ImageWithFallback({ sources, alt, className }: ImageWithFallbackProps) {
  const uniqueSources = useMemo(() => {
    const seen = new Set<string>()
    const out: string[] = []
    for (const source of sources) {
      const trimmed = source?.trim()
      if (!trimmed || seen.has(trimmed)) continue
      const normalised = normaliseImageSource(trimmed)
      if (seen.has(normalised)) continue
      seen.add(normalised)
      out.push(normalised)
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
