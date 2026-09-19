"use client"

import Image from "next/image"
import { useState } from "react"

export function LandingPlayerImage() {
  const [loaded, setLoaded] = useState(false)

  return (
    <div
      data-landing-artwork
      data-loaded={loaded}
      className="relative mx-auto w-full max-w-[36rem] min-w-0 lg:self-end"
    >
      <Image
        src="/nrl_players-removebg-preview.png"
        alt="NRL players"
        width={666}
        height={375}
        priority
        sizes="(min-width: 1280px) 576px, (min-width: 1024px) 48vw, (min-width: 640px) 576px, 100vw"
        onLoad={() => setLoaded(true)}
        className="h-auto w-full object-contain"
        style={{
          maskImage: "linear-gradient(to bottom, black 0%, black 78%, transparent 100%)",
          WebkitMaskImage: "linear-gradient(to bottom, black 0%, black 78%, transparent 100%)",
        }}
      />
    </div>
  )
}
