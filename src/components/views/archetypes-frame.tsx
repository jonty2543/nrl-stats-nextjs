"use client";

import { useState } from "react";

export function ArchetypesFrame() {
  const [loaded, setLoaded] = useState(false);

  return (
    <section className="min-h-0 bg-[#111733]">
      <iframe
        src="/api/archetypes/index.html"
        title="NRL player archetypes"
        onLoad={() => setLoaded(true)}
        className={`block h-[calc(100vh-14.5rem)] min-h-[720px] w-full border-0 bg-[#111733] transition-opacity duration-0 ${
          loaded ? "opacity-100" : "opacity-0"
        }`}
        style={{ colorScheme: "dark" }}
      />
    </section>
  );
}
