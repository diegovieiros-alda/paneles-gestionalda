import { BrowserRouter, Routes, Route, Link, Navigate } from "react-router-dom";
import OportunidadesPage from "@/pages/oportunidades";
import HotelDesayunosPage from "@/pages/hotel-desayunos";
import HotelBloqueosPage from "@/pages/hotel-bloqueos";
import BloqueosPage from "@/pages/bloqueos";
import DesayunosPage from "@/pages/desayunos";
import DesayunosDondeActuarPage from "@/pages/desayunos-donde-actuar";
import DesayunosDetallePage from "@/pages/desayunos-detalle";
import TendenciasPage from "@/pages/tendencias";
import AlertasPage from "@/pages/alertas";
import AjustesPage from "@/pages/ajustes";
import RegistroPage from "@/pages/registro";
import LoginPage from "@/pages/login";
import UsuariosPage from "@/pages/usuarios";
import { AuthProvider, useAuth } from "@/lib/auth-context";
import { ProtectedRoute, SuperuserRoute } from "@/components/dashboard/protected-route";
import { NAV } from "@/components/dashboard/sidebar";

function Inicio() {
  const { usuario, cargando } = useAuth();
  if (cargando) return null;
  if (!usuario) return <Navigate to="/login" replace />;
  const primero = NAV.find((n) => usuario.dashboards.includes(n.dashboard));
  return <Navigate to={primero?.to ?? "/ajustes"} replace />;
}

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
              son navegables y respetan el rol del usuario.

              No existe una sección "Hoteles" independiente: cada dashboard
              con datos por hotel trae su propio listado (dentro de la
              página del dashboard) y su propia ficha de detalle, gateada
              por el permiso de ese dashboard, no por uno genérico. */}
          <Route path="/" element={<Inicio />} />
          <Route path="/bloqueos" element={<ProtectedRoute dashboard="bloqueos"><BloqueosPage /></ProtectedRoute>} />
          <Route path="/bloqueos/:hotelId" element={<ProtectedRoute dashboard="bloqueos"><HotelBloqueosPage /></ProtectedRoute>} />
          <Route path="/desayunos" element={<ProtectedRoute dashboard="desayunos"><DesayunosPage /></ProtectedRoute>} />
          <Route path="/desayunos/donde-actuar" element={<ProtectedRoute dashboard="desayunos"><DesayunosDondeActuarPage /></ProtectedRoute>} />
          <Route path="/desayunos/detalle" element={<ProtectedRoute dashboard="desayunos"><DesayunosDetallePage /></ProtectedRoute>} />
          <Route path="/desayunos/:hotelId" element={<ProtectedRoute dashboard="desayunos"><HotelDesayunosPage /></ProtectedRoute>} />
          <Route path="/oportunidades" element={<ProtectedRoute dashboard="oportunidades"><OportunidadesPage /></ProtectedRoute>} />
          <Route path="/tendencias" element={<ProtectedRoute dashboard="tendencias"><TendenciasPage /></ProtectedRoute>} />
          <Route path="/alertas" element={<ProtectedRoute dashboard="alertas"><AlertasPage /></ProtectedRoute>} />
          <Route path="/ajustes" element={<ProtectedRoute dashboard="ajustes"><AjustesPage /></ProtectedRoute>} />
          <Route path="/usuarios" element={<SuperuserRoute><UsuariosPage /></SuperuserRoute>} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
