import { Link } from "react-router-dom";
import { ArrowLeft, MapPin, Building2, Tag } from "lucide-react";
import type { HotelDirectorio } from "@/lib/hoteles-api";

export function HotelDetailHeader({
  hotel, backTo, backLabel,
}: { hotel: HotelDirectorio; backTo: string; backLabel: string }) {
  return (
    <>
      <div className="flex items-center gap-3">
        <Link to={backTo} className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" /> {backLabel}
        </Link>
      </div>
      <div className="rounded-xl border border-border bg-surface p-6 shadow-soft">
        {/* Código de propiedad, no el id interno de Odoo — es el identificador
            que reconoce el negocio (ej. "403"), el id interno no dice nada. */}
        <div className="text-[11px] text-muted-foreground uppercase tracking-wide">Hotel · {hotel.codigo || hotel.id}</div>
        <h1 className="mt-1 text-2xl font-semibold text-foreground">{hotel.name}</h1>
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" /> {hotel.zona}</span>
          <span className="inline-flex items-center gap-1"><Building2 className="h-3.5 w-3.5" /> {hotel.sociedad}</span>
          <span className="inline-flex items-center gap-1"><Tag className="h-3.5 w-3.5" /> {hotel.submarca}</span>
        </div>
      </div>
    </>
  );
}
