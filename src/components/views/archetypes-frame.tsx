"use client";

import { useState } from "react";

export function ArchetypesFrame() {
  const [isReady, setIsReady] = useState(false);

  return (
    <section
      aria-busy={!isReady}
      className="relative min-h-0 bg-[#111733]"
    >
      <iframe
        src="/api/archetypes/index.html"
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
