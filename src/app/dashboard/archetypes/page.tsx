export const dynamic = "force-dynamic";

export default function ArchetypesPage() {
  return (
    <section className="min-h-0">
      <div className="overflow-hidden rounded-lg border border-nrl-border bg-nrl-panel shadow-[0_18px_60px_rgba(0,0,0,0.22)]">
        <iframe
          src="/api/archetypes/index.html"
          title="NRL player archetypes"
          className="block h-[calc(100vh-14.5rem)] min-h-[720px] w-full bg-nrl-bg"
        />
      </div>
    </section>
  );
}
