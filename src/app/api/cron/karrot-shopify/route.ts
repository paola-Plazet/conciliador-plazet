import { NextRequest, NextResponse } from "next/server";
import { autorizadoCron } from "@/lib/cron-auth";
import { cargarKarrotShopify } from "@/lib/karrot-shopify-carga";

export const runtime = "nodejs";

/**
 * Recibe el CSV del conector de Karrot (generate-report ALL_SALES con
 * locationID de SHOPIFY) — ventas web Plazet que entran solas por la
 * integración y llegan sin método de pago, por eso el reporte de métodos de
 * pago de /api/cron/karrot no las trae. Mismo token que /api/cron/karrot.
 */
export async function POST(req: NextRequest) {
  if (!autorizadoCron(req, "KARROT_PUSH_TOKEN")) return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  const text = await req.text();
  if (!/Invoice #/.test(text) || !/Warehouse Name/.test(text)) {
    return NextResponse.json({ error: "No parece el reporte ALL_SALES del conector de Karrot." }, { status: 400 });
  }
  return NextResponse.json({ ok: true, ...(await cargarKarrotShopify(text)) });
}
