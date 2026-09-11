import { NextRequest, NextResponse } from "next/server";
import { autorizadoCron } from "@/lib/cron-auth";
import { syncTodo } from "@/lib/sync";

export const runtime = "nodejs";
// Las tres sincronizaciones van en paralelo pero Shopify (≈850 pedidos
// paginados) + Alegra (≈1.300 pagos) tardan ~50 s: se pide más tiempo del
// que dan las rutas normales (Fluid compute lo permite)
export const maxDuration = 300;

/** Cron diario de Vercel (vercel.json): sincroniza Shopify + Mercado Pago +
 * Alegra sin tocar el botón de /web. Vercel llama con
 * `Authorization: Bearer $CRON_SECRET`. */
export async function GET(req: NextRequest) {
  if (!autorizadoCron(req)) return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  const out = await syncTodo();
  return NextResponse.json({ ok: out.errores.length === 0, ...out });
}

export const POST = GET;
