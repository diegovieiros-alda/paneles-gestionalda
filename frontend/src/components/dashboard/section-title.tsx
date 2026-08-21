export function SectionTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="pt-2">
      <h2 className="text-xs font-bold uppercase tracking-wide text-foreground border-b-2 border-foreground/80 pb-1.5">
        {title}
      </h2>
      {subtitle && <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>}
    </div>
  );
}
