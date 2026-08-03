// Puerta de entrada: toda la app exige la cookie de sesión emitida vía SSO
// desde la nómina, y el ROL de Conciliaciones se hace cumplir aquí:
//   VIEWER → solo lectura (ningún método de escritura)
//   EDITOR → puede cargar/ajustar, pero no tocar configuración ni cerrar meses
//   ADMIN  → todo
import { NextResponse, type NextRequest } from "next/server";
import { validarSesion, SESSION_COOKIE } from "./lib/sso";

const PUBLICAS = ["/acceso", "/api/sso", "/api/salir"];
// rutas de escritura reservadas para ADMIN
const SOLO_ADMIN = ["/api/config", "/api/months"];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (PUBLICAS.some((p) => pathname.startsWith(p))) return NextResponse.next();

  const sesion = await validarSesion(request.cookies.get(SESSION_COOKIE)?.value);
  if (!sesion) {
    // API sin sesión → 401; páginas → /acceso
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Sesión requerida" }, { status: 401 });
    }
    return NextResponse.redirect(new URL("/acceso", request.url));
  }

  // escrituras según rol (las lecturas GET pasan siempre)
  const esEscritura = request.method !== "GET" && request.method !== "HEAD";
  if (esEscritura && sesion.rol === "VIEWER") {
    return NextResponse.json({ error: "Tu rol en Conciliaciones es de solo lectura" }, { status: 403 });
  }
  if (esEscritura && sesion.rol === "EDITOR" && SOLO_ADMIN.some((p) => pathname.startsWith(p))) {
    return NextResponse.json({ error: "Solo un administrador puede cambiar esto" }, { status: 403 });
  }

  return NextResponse.next();
}

export const config = {
  // todo menos los assets de Next
  matcher: ["/((?!_next/static|_next/image|favicon.ico|images/).*)"],
};
