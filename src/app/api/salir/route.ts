// Cierra la sesión del conciliador (borra la cookie) y devuelve al portal.
import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/sso";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const portal = `${process.env.NEXT_PUBLIC_NOMINA_URL ?? new URL("/acceso", request.url).toString()}/portal`;
  const res = NextResponse.redirect(
    process.env.NEXT_PUBLIC_NOMINA_URL ? portal : new URL("/acceso", request.url),
  );
  res.cookies.delete(SESSION_COOKIE);
  return res;
}
