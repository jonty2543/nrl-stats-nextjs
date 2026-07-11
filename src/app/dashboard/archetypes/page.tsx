export const dynamic = "force-dynamic";

export default function ArchetypesPage() {
  return (
    <section className="min-h-0">
      <iframe
        src="/api/archetypes/index.html"
        title="NRL player archetypes"
        className="block h-[calc(100vh-14.5rem)] min-h-[720px] w-full border-0 bg-[#111733]"
        style={{ colorScheme: "dark" }}
      />
    </section>
  );
}
