"use client";

export function ArchetypesFrame() {
  const repaintFrame = (frame: HTMLIFrameElement) => {
    frame.style.opacity = "0.99";
    frame.style.transform = "translateZ(0)";
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        frame.style.opacity = "1";
        frame.style.transform = "none";
      });
    });
  };

  return (
    <section className="min-h-0 bg-transparent">
      <iframe
        src="/api/archetypes/index.html"
        title="NRL player archetypes"
        onLoad={(event) => repaintFrame(event.currentTarget)}
        className="block h-[calc(100vh-14.5rem)] min-h-[720px] w-full border-0"
        style={{ colorScheme: "dark", backgroundColor: "#111733" }}
      />
    </section>
  );
}
