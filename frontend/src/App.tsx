import { BrowserRouter, Routes, Route, Link } from "react-router-dom";
import DashboardHome from "@/pages/donde-actuar";
import OportunidadesPage from "@/pages/oportunidades";
import HotelesIndex from "@/pages/hoteles";
import HotelDetail from "@/pages/hotel-detail";
import BloqueosPage from "@/pages/bloqueos";
import TendenciasPage from "@/pages/tendencias";
import AlertasPage from "@/pages/alertas";
import AjustesPage from "@/pages/ajustes";

function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Página no encontrada</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          La página que buscas no existe o se ha movido.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Ir al inicio
          </Link>
        </div>
      </div>
    </div>
  );
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Bloqueos es la única sección conectada a datos reales por ahora,
            así que es la portada. El resto (mock) sigue accesible por URL
            directa para cuando se activen. */}
        <Route path="/" element={<BloqueosPage />} />
        <Route path="/bloqueos" element={<BloqueosPage />} />
        <Route path="/donde-actuar" element={<DashboardHome />} />
        <Route path="/oportunidades" element={<OportunidadesPage />} />
        <Route path="/hoteles" element={<HotelesIndex />} />
        <Route path="/hoteles/:hotelId" element={<HotelDetail />} />
        <Route path="/tendencias" element={<TendenciasPage />} />
        <Route path="/alertas" element={<AlertasPage />} />
        <Route path="/ajustes" element={<AjustesPage />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
