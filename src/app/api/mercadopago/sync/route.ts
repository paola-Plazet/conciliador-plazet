import { NextRequest, NextResponse } from "next/server";
import { validarSesion, SESSION_COOKIE } from "@/lib/sso";
import { syncMercadoPago } from "@/lib/sync";

export const runtime = "nodejs";
export const maxDuration = 60;

const NIVEL: Record<string, number> = { VIEWER: 0, EDITOR: 1, ADMIN: 2 };

/** Sincroniza los cobros de Mercado Pago por API (reemplaza el archivo de
 * liquidaciones), respetando los meses cerrados. Rol EDITOR+. La lógica vive
 * en lib/sync.ts (la comparte el cron diario). */
export async function POST(req: NextRequest) {
  const sesion = await validarSesion(req.cookies.get(SESSION_COOKIE)?.value);
  if (!sesion) return NextResponse.json({ error: "Sesión requerida." }, { status: 401 });
  if (NIVEL[sesion.rol] < NIVEL.EDITOR) {
    return NextResponse.json({ error: "Tu rol no permite sincronizar." }, { status: 403 });
  }
  try {
    const out = await syncMercadoPago();
    return NextResponse.json({ ok: true, ...out });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
