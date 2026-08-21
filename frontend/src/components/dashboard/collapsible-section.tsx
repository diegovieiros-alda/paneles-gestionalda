import { useState, type ReactNode, type ComponentType } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export function CollapsibleSection({
  title, subtitle, icon: Icon, defaultOpen = false, children,
}: {
  title: string;
  subtitle?: string;
  icon: ComponentType<{ className?: string }>;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="rounded-xl border border-border bg-surface shadow-soft overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-3 px-5 py-4 hover:bg-accent/20 transition-colors"
      >
        <div className="flex items-center gap-2.5">
          <div className="grid place-items-center h-8 w-8 rounded-lg bg-primary/10 text-primary shrink-0">
            <Icon className="h-4 w-4" />
          </div>
          <div className="text-left">
            <div className="text-sm font-semibold text-foreground">{title}</div>
            {subtitle && <div className="text-xs text-muted-foreground">{subtitle}</div>}
          </div>
        </div>
        <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform shrink-0", open && "rotate-180")} />
      </button>
      {open && <div className="border-t border-border p-5">{children}</div>}
    </section>
  );
}
