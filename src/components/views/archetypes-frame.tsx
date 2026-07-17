"use client";

import { useState } from "react";

const dashboardBackgroundImage =
  "radial-gradient(circle at top left, rgba(92, 108, 220, 0.18), transparent 36%), radial-gradient(circle at 72% 18%, rgba(70, 92, 180, 0.08), transparent 28%), radial-gradient(circle at bottom right, rgba(58, 84, 176, 0.16), transparent 34%), linear-gradient(180deg, #111733 0%, #10162f 48%, #0f142b 100%)";

export function ArchetypesFrame() {
  const [loaded, setLoaded] = useState(false);

  return (
    <section className="min-h-0 bg-[#111733]" style={{ backgroundImage: dashboardBackgroundImage }}>
      <iframe
        src="/api/archetypes/index.html"
        title="NRL player archetypes"
        onLoad={() => setLoaded(true)}
        className={`block h-[calc(100vh-14.5rem)] min-h-[720px] w-full border-0 bg-transparent transition-opacity duration-0 ${
          loaded ? "opacity-100" : "opacity-0"
        }`}
        style={{ colorScheme: "dark", backgroundColor: "transparent" }}
      />
    </section>
  );
}
