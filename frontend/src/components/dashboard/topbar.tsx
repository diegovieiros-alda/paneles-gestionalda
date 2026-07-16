import { Search, Bell } from "lucide-react";
import { Button } from "@/components/ui/button";

export function Topbar({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <header className="h-16 border-b border-border bg-surface/70 backdrop-blur sticky top-0 z-30">
      <div className="h-full flex items-center gap-4 px-6">
        <div className="min-w-0">
          <h1 className="text-[15px] font-semibold text-foreground truncate">{title}</h1>
          {subtitle && <p className="text-xs text-muted-foreground truncate">{subtitle}</p>}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <div className="hidden md:flex items-center gap-2 h-9 rounded-lg border border-border bg-surface px-3 text-sm text-muted-foreground w-64">
            <Search className="h-4 w-4" />
            <input placeholder="Buscar hotel, zona…" className="bg-transparent outline-none flex-1 text-foreground placeholder:text-muted-foreground" />
          </div>
          <Button variant="ghost" size="icon" className="relative">
            <Bell className="h-4 w-4" />
            <span className="absolute top-2 right-2 h-1.5 w-1.5 rounded-full bg-danger" />
          </Button>
          <div className="h-8 w-8 rounded-full bg-primary/90 text-primary-foreground grid place-items-center text-xs font-semibold">RM</div>
        </div>
      </div>
    </header>
  );
}
