import { NextRequest, NextResponse } from "next/server";
import { validarSesion, SESSION_COOKIE } from "@/lib/sso";
import { syncShopify } from "@/lib/sync";

export const runtime = "nodejs";
// La sincronización puede tardar (paginación de pedidos de dos tiendas)
export const maxDuration = 60;

const NIVEL: Record<string, number> = { VIEWER: 0, EDITOR: 1, ADMIN: 2 };

/** Sincroniza los pedidos web de Shopify (Plazet + Natural Light) por API.
 * Rol EDITOR+. La lógica vive en lib/sync.ts (la comparte el cron diario). */
export async function POST(req: NextRequest) {
  const sesion = await validarSesion(req.cookies.get(SESSION_COOKIE)?.value);
  if (!sesion) return NextResponse.json({ error: "Sesión requerida." }, { status: 401 });
  if (NIVEL[sesion.rol] < NIVEL.EDITOR) {
    return NextResponse.json({ error: "Tu rol no permite sincronizar." }, { status: 403 });
  }
  try {
    const out = await syncShopify();
    return NextResponse.json({ ok: true, shops: out.shops, errors: out.errors });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
