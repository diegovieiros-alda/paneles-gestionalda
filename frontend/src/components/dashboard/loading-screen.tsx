// Pantalla completa mientras se resuelve la sesión (AuthProvider.cargando)
// — antes se devolvía null ahí, un parpadeo en blanco en cada carga o
// cambio de ruta protegida.
export function LoadingScreen() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="h-9 w-9 animate-spin rounded-full border-[3px] border-border border-t-primary" />
    </div>
  );
}
