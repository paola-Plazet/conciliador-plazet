import { NextRequest } from "next/server";
import { ingestFiles, computeLedger } from "@/lib/ledger";

export const runtime = "nodejs";

/** Sube archivos al libro acumulado: cada archivo reemplaza su rango de
 * fechas (los meses cerrados no se tocan) y se recalcula la conciliación. */
export async function POST(request: NextRequest) {
  try {
    const form = await request.formData();
    const files = form.getAll("files").filter((f): f is File => f instanceof File);
    if (files.length === 0) {
      return Response.json({ error: "No se recibió ningún archivo." }, { status: 400 });
    }

    const buffers = await Promise.all(
      files.map(async (f) => ({
        filename: f.name,
        buffer: Buffer.from(await f.arrayBuffer()),
      })),
    );

    const ingest = await ingestFiles(buffers);
    const anyLoaded = ingest.files.some((f) => f.inserted > 0);
    if (!anyLoaded) {
      return Response.json(
        {
          error: "Ningún archivo cargó datos.",
          detected: ingest.files.map((f) => ({ name: f.filename, kind: f.kind })),
          warnings: ingest.warnings,
        },
        { status: 400 },
      );
    }

    const status = await computeLedger();

    return Response.json({
      detected: ingest.files.map((f) => ({
        name: f.filename,
        kind: f.kind,
        rows: f.inserted,
        skipped: f.skipped,
        from: f.from,
        to: f.to,
      })),
      warnings: [...ingest.warnings],
      cut: status.cut,
      months: status.months,
      totals: status.summary.totals,
      alerts: status.summary.alerts,
      pendings: status.summary.pendings,
      counts: {
        sales: ingest.files.filter((f) => f.kind === "alegra" || f.kind === "alegra_trans" || f.kind === "karrot").reduce((a, f) => a + f.inserted, 0),
        bank: ingest.files.filter((f) => f.kind === "banco").reduce((a, f) => a + f.inserted, 0),
        datafono: ingest.files.filter((f) => f.kind === "datafono").reduce((a, f) => a + f.inserted, 0),
        qr: ingest.files.filter((f) => f.kind === "datafono_banco").reduce((a, f) => a + f.inserted, 0),
      },
    });
  } catch (err) {
    console.error("Error en /api/process:", err);
    return Response.json(
      { error: err instanceof Error ? err.message : "Error procesando archivos." },
      { status: 500 },
    );
  }
}
