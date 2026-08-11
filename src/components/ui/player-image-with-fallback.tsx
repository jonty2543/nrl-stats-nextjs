"use client"

import { ImageWithFallback } from "@/components/ui/image-with-fallback"

export const PLAYER_SILHOUETTE_SRC = "/player-silhouette.svg"

interface PlayerImageWithFallbackProps {
  sources: string[]
  alt: string
  className?: string
  loading?: "eager" | "lazy"
  fetchPriority?: "high" | "low" | "auto"
}

export function PlayerImageWithFallback({
  sources,
  ...props
}: PlayerImageWithFallbackProps) {
  return <ImageWithFallback sources={[...sources, PLAYER_SILHOUETTE_SRC]} {...props} />
}
