import { BrowserRouter, Routes, Route, Link } from "react-router-dom";
import DashboardHome from "@/pages/donde-actuar";
import OportunidadesPage from "@/pages/oportunidades";
import HotelesIndex from "@/pages/hoteles";
import HotelDetail from "@/pages/hotel-detail";
import BloqueosPage from "@/pages/bloqueos";
import DesayunosPage from "@/pages/desayunos";
import TendenciasPage from "@/pages/tendencias";
import AlertasPage from "@/pages/alertas";
import AjustesPage from "@/pages/ajustes";
import RegistroPage from "@/pages/registro";
import LoginPage from "@/pages/login";
import { AuthProvider } from "@/lib/auth-context";
import { ProtectedRoute } from "@/components/dashboard/protected-route";

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
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/registro" element={<RegistroPage />} />

          {/* Bloqueos y Desayunos están conectados a datos reales de Odoo; el
              resto sigue con datos de ejemplo hasta que se conecten, pero ya
              son navegables y respetan el rol del usuario. */}
          <Route path="/" element={<ProtectedRoute dashboard="donde_actuar"><DashboardHome /></ProtectedRoute>} />
          <Route path="/bloqueos" element={<ProtectedRoute dashboard="bloqueos"><BloqueosPage /></ProtectedRoute>} />
          <Route path="/desayunos" element={<ProtectedRoute dashboard="desayunos"><DesayunosPage /></ProtectedRoute>} />
          <Route path="/oportunidades" element={<ProtectedRoute dashboard="oportunidades"><OportunidadesPage /></ProtectedRoute>} />
          <Route path="/hoteles" element={<ProtectedRoute dashboard="hoteles"><HotelesIndex /></ProtectedRoute>} />
          <Route path="/hoteles/:hotelId" element={<ProtectedRoute dashboard="hoteles"><HotelDetail /></ProtectedRoute>} />
          <Route path="/tendencias" element={<ProtectedRoute dashboard="tendencias"><TendenciasPage /></ProtectedRoute>} />
          <Route path="/alertas" element={<ProtectedRoute dashboard="alertas"><AlertasPage /></ProtectedRoute>} />
          <Route path="/ajustes" element={<ProtectedRoute dashboard="ajustes"><AjustesPage /></ProtectedRoute>} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
