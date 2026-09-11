import { NextRequest, NextResponse } from "next/server";
import { validarSesion, SESSION_COOKIE } from "@/lib/sso";
import { syncAlegra, mesColombia } from "@/lib/sync";

export const runtime = "nodejs";
export const maxDuration = 60;

const NIVEL: Record<string, number> = { VIEWER: 0, EDITOR: 1, ADMIN: 2 };

/** Sincroniza desde Alegra los pagos de un mes (?month=YYYY-MM, por defecto el
 * actual) con su cuenta destino. Reemplaza lo que hubiera de ese mes. La
 * lógica vive en lib/sync.ts (la comparte el cron diario). */
export async function POST(req: NextRequest) {
  const sesion = await validarSesion(req.cookies.get(SESSION_COOKIE)?.value);
  if (!sesion) return NextResponse.json({ error: "Sesión requerida." }, { status: 401 });
  if (NIVEL[sesion.rol] < NIVEL.EDITOR) {
    return NextResponse.json({ error: "Tu rol no permite sincronizar." }, { status: 403 });
  }
  const month = req.nextUrl.searchParams.get("month") ?? mesColombia(0);
  if (!/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json({ error: "Mes inválido (YYYY-MM)." }, { status: 400 });
  }
  try {
    const out = await syncAlegra(month);
    return NextResponse.json({ ok: true, ...out });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
