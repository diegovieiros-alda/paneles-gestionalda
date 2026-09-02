import { lazy, Suspense, type ReactNode } from "react";
import { BrowserRouter, Routes, Route, Link, Navigate, Outlet } from "react-router-dom";
import { AuthProvider, useAuth } from "@/lib/auth-context";
import { AjustesDesayunoProvider } from "@/lib/ajustes-desayuno-context";
import { DesayunosFiltrosProvider } from "@/lib/desayunos-filtros-context";
import { ProtectedRoute, SuperuserRoute } from "@/components/dashboard/protected-route";
import { LoadingScreen } from "@/components/dashboard/loading-screen";
import { NAV } from "@/components/dashboard/sidebar";

// Cada página es su propio chunk (antes: un único bundle de ~805KB con las
// 16 páginas y sus dependencias — recharts incluido — cargado entero para
// entrar a Login). React Router ya muestra <Suspense fallback> mientras
// carga el chunk de la ruta destino, así que no hace falta loading manual
// por página.
const HotelDesayunosPage = lazy(() => import("@/pages/hotel-desayunos"));
const HotelBloqueosPage = lazy(() => import("@/pages/hotel-bloqueos"));
const BloqueosPage = lazy(() => import("@/pages/bloqueos"));
const BloqueosOportunidadesPage = lazy(() => import("@/pages/bloqueos-oportunidades"));
const BloqueosTendenciasPage = lazy(() => import("@/pages/bloqueos-tendencias"));
const BloqueosAlertasPage = lazy(() => import("@/pages/bloqueos-alertas"));
const BloqueosAjustesPage = lazy(() => import("@/pages/bloqueos-ajustes"));
const DesayunosPage = lazy(() => import("@/pages/desayunos"));
const DesayunosDetallePage = lazy(() => import("@/pages/desayunos-detalle"));
const DesayunosOportunidadesPage = lazy(() => import("@/pages/desayunos-oportunidades"));
const DesayunosTendenciasPage = lazy(() => import("@/pages/desayunos-tendencias"));
const DesayunosAlertasPage = lazy(() => import("@/pages/desayunos-alertas"));
const DesayunosAjustesPage = lazy(() => import("@/pages/desayunos-ajustes"));
const RegistroPage = lazy(() => import("@/pages/registro"));
const LoginPage = lazy(() => import("@/pages/login"));
const UsuariosPage = lazy(() => import("@/pages/usuarios"));

// Todas las rutas de Desayunos comparten los ajustes editables (objetivo de
// penetración, umbral de alerta, objetivo de oportunidad) — un solo fetch
// para todas, no uno por página.
function DesayunosRoute({ children }: { children: ReactNode }) {
  return (
    <ProtectedRoute dashboard="desayunos">
      <AjustesDesayunoProvider>{children}</AjustesDesayunoProvider>
    </ProtectedRoute>
  );
}

// Detalle/Oportunidades/Tendencias/Alertas comparten además Periodo/Hotel/
// Producto (DesayunosFiltrosProvider) — son las 4 "secciones" entre las que
// se navega con las mismas pestañas, y antes cada una montaba su propio
// useDesayunosData() desde cero, reseteando los filtros al cambiar de
// pestaña (reportado explícitamente). Un solo <Outlet/> como hijo hace que
// el Provider no se desmonte al navegar entre ellas. La portada, Ajustes y
// la ficha de un hotel se quedan fuera a propósito: no consumen esos
// filtros y no tiene sentido pagar ese fetch en esas páginas.
function DesayunosSeccionesLayout() {
  return (
    <ProtectedRoute dashboard="desayunos">
      <AjustesDesayunoProvider>
        <DesayunosFiltrosProvider>
          <Outlet />
        </DesayunosFiltrosProvider>
      </AjustesDesayunoProvider>
    </ProtectedRoute>
  );
}

function Inicio() {
  const { usuario, cargando } = useAuth();
  if (cargando) return <LoadingScreen />;
  if (!usuario) return <Navigate to="/login" replace />;
  const primero = NAV.find((n) => usuario.dashboards.includes(n.dashboard));
  return <Navigate to={primero?.to ?? "/login"} replace />;
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
        <Suspense fallback={<LoadingScreen />}>
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
            <Route path="/bloqueos/oportunidades" element={<ProtectedRoute dashboard="bloqueos"><BloqueosOportunidadesPage /></ProtectedRoute>} />
            <Route path="/bloqueos/tendencias" element={<ProtectedRoute dashboard="bloqueos"><BloqueosTendenciasPage /></ProtectedRoute>} />
            <Route path="/bloqueos/alertas" element={<ProtectedRoute dashboard="bloqueos"><BloqueosAlertasPage /></ProtectedRoute>} />
            <Route path="/bloqueos/ajustes" element={<ProtectedRoute dashboard="bloqueos"><BloqueosAjustesPage /></ProtectedRoute>} />
            <Route path="/bloqueos/:hotelId" element={<ProtectedRoute dashboard="bloqueos"><HotelBloqueosPage /></ProtectedRoute>} />
            <Route path="/desayunos" element={<DesayunosRoute><DesayunosPage /></DesayunosRoute>} />
            <Route element={<DesayunosSeccionesLayout />}>
              <Route path="/desayunos/detalle" element={<DesayunosDetallePage />} />
              <Route path="/desayunos/oportunidades" element={<DesayunosOportunidadesPage />} />
              <Route path="/desayunos/tendencias" element={<DesayunosTendenciasPage />} />
              <Route path="/desayunos/alertas" element={<DesayunosAlertasPage />} />
            </Route>
            <Route path="/desayunos/ajustes" element={<DesayunosRoute><DesayunosAjustesPage /></DesayunosRoute>} />
            <Route path="/desayunos/:hotelId" element={<DesayunosRoute><HotelDesayunosPage /></DesayunosRoute>} />
            <Route path="/usuarios" element={<SuperuserRoute><UsuariosPage /></SuperuserRoute>} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
