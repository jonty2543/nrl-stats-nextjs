interface SectionHeaderProps {
  title: string;
}

export function SectionHeader({ title }: SectionHeaderProps) {
  return (
    <div className="text-[0.7rem] font-bold uppercase tracking-wide text-nrl-muted mb-1">
      {title}
    </div>
  );
}
