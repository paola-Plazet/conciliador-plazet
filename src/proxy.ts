// Puerta de entrada: toda la app exige la cookie de sesión emitida vía SSO
// desde la nómina. Sin sesión → /acceso (que manda al portal de la nómina).
import { NextResponse, type NextRequest } from "next/server";
import { validarSesion, SESSION_COOKIE } from "./lib/sso";

const PUBLICAS = ["/acceso", "/api/sso"];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (PUBLICAS.some((p) => pathname.startsWith(p))) return NextResponse.next();

  const sesion = await validarSesion(request.cookies.get(SESSION_COOKIE)?.value);
  if (sesion) return NextResponse.next();

  // API sin sesión → 401; páginas → /acceso
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Sesión requerida" }, { status: 401 });
  }
  return NextResponse.redirect(new URL("/acceso", request.url));
}

export const config = {
  // todo menos los assets de Next
  matcher: ["/((?!_next/static|_next/image|favicon.ico|images/).*)"],
};
