// Recibe el pase corto emitido por la nómina, lo verifica y deja la cookie de
// sesión del conciliador. Luego manda al tablero.
import { NextRequest, NextResponse } from "next/server";
import { verificarPase, emitirSesion, SESSION_COOKIE } from "@/lib/sso";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  if (!token) return NextResponse.redirect(new URL("/acceso", request.url));
  try {
    const usuario = await verificarPase(token);
    const res = NextResponse.redirect(new URL("/", request.url));
    res.cookies.set(SESSION_COOKIE, await emitirSesion(usuario), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 30 * 24 * 60 * 60,
      path: "/",
    });
    return res;
  } catch {
    return NextResponse.redirect(new URL("/acceso?error=pase", request.url));
  }
}
