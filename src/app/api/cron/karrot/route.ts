import { NextRequest, NextResponse } from "next/server";
import { autorizadoCron } from "@/lib/cron-auth";
import { ingestFiles } from "@/lib/ledger";
import { esCsvConectorKarrot, parseKarrotPagos } from "@/lib/parsers/karrot-pagos";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Recibe el CSV del CONECTOR de Karrot (MCP generate-report
 * ALL_SALES_DETAIL_PAYMENT_METHOD) y lo carga por el mismo camino de /cargar
 * (detección + reemplazo del rango de fechas). Lo llama la rutina diaria de
 * Claude con `Authorization: Bearer $KARROT_PUSH_TOKEN` (o CRON_SECRET) y el
 * CSV como cuerpo (text/csv). Tolera el prefijo "[Resource from ...]" con el
 * que el MCP entrega el archivo.
 */
export async function POST(req: NextRequest) {
  if (!autorizadoCron(req, "KARROT_PUSH_TOKEN")) return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  let text = await req.text();
  text = text.replace(/^\uFEFF/, "").replace(/^\[Resource from [^\]]*\]\s*/, "").trim();
  if (!text) return NextResponse.json({ error: "Cuerpo vacío: se esperaba el CSV del conector de Karrot." }, { status: 400 });
  const buffer = Buffer.from(text + "\n", "utf8");
  if (!esCsvConectorKarrot(buffer)) {
    return NextResponse.json({ error: "No parece el CSV del conector de Karrot (faltan 'Invoice #' / 'Payment Method Value')." }, { status: 400 });
  }
  const parsed = parseKarrotPagos(buffer);
  if (parsed.sales.length === 0) {
    return NextResponse.json({ error: "El CSV no trae pagos.", warnings: parsed.warnings }, { status: 400 });
  }
  const dates = parsed.sales.map((s) => s.date).sort();
  const from = dates[0];
  const to = dates[dates.length - 1];
  const out = await ingestFiles([{ filename: `karrot-conector-${from}_${to}.csv`, buffer }]);
  const f = out.files[0];
  const porDia: Record<string, { pagos: number; venta: number }> = {};
  for (const s of parsed.sales) {
    const d = (porDia[s.date] ??= { pagos: 0, venta: 0 });
    d.pagos++;
    d.venta += s.amount;
  }
  for (const d of Object.values(porDia)) d.venta = Math.round(d.venta);
  return NextResponse.json({
    ok: true,
    filas: f?.inserted ?? 0,
    from: f?.from ?? from,
    to: f?.to ?? to,
    omitidasMesCerrado: f?.skipped ?? 0,
    porDia,
    warnings: out.warnings,
  });
}
