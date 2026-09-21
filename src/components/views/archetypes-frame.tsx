"use client";

import { useState } from "react";

export function ArchetypesFrame({ cupAccessToken }: { cupAccessToken: string | null }) {
  const [isReady, setIsReady] = useState(false);

  return (
    <section
      aria-busy={!isReady}
      className="relative min-h-0 bg-[#111733]"
    >
      {!isReady ? (
        <div role="status" aria-label="Loading archetypes" className="absolute inset-0 flex items-center justify-center">
          <span aria-hidden="true" className="h-7 w-7 animate-spin rounded-full border-[3px] border-emerald-400/20 border-t-emerald-400" />
        </div>
      ) : null}
      <iframe
        src={`/api/archetypes/index.html${cupAccessToken ? `?cupAccess=${encodeURIComponent(cupAccessToken)}` : ""}`}
        title="NRL player archetypes"
        onLoad={() => window.requestAnimationFrame(() => setIsReady(true))}
        className="block h-[calc(100vh-14.5rem)] min-h-[720px] w-full border-0 transition-opacity duration-150"
        style={{
          colorScheme: "dark",
          backgroundColor: "#111733",
          opacity: isReady ? 1 : 0,
        }}
      />
    </section>
  );
}
