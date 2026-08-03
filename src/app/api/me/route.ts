// Quién soy: nombre y rol de la sesión actual (para que el menú se adapte).
import { NextRequest, NextResponse } from "next/server";
import { validarSesion, SESSION_COOKIE } from "@/lib/sso";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const sesion = await validarSesion(request.cookies.get(SESSION_COOKIE)?.value);
  if (!sesion) return NextResponse.json({ error: "Sesión requerida" }, { status: 401 });
  return NextResponse.json({ name: sesion.name, email: sesion.email, rol: sesion.rol });
}
