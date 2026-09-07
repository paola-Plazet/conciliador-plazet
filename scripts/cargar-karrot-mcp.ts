// Carga los CSV que entrega el conector de Karrot (MCP generate-report):
//   CUSTOMER_CREDIT_NOTES  → tabla CreditNote
//   CASHIER_BALANCE        → tabla CashierClose (solo cierres) + ventas NEGATIVAS
//                            sintéticas (source karrot_devolucion) por las
//                            devoluciones de cada método, para que el motor y
//                            el tablero las descuenten del canal correcto.
//   npx tsx scripts/cargar-karrot-mcp.ts <archivo.csv> [...]
import fs from "node:fs";
import path from "node:path";
import { prisma } from "../src/lib/db";
import {
  detectKarrotMcp, parseCreditNotesCsv, parseCashierBalanceCsv, metodoCierre, SOURCE_DEVOLUCION,
} from "../src/lib/parsers/karrot-mcp";

const fmt = (n: number) => "$" + Math.round(n).toLocaleString("es-CO");

async function main() {
  const rutas = process.argv.slice(2).filter((p) => fs.existsSync(p));
  if (!rutas.length) { console.log("Uso: npx tsx scripts/cargar-karrot-mcp.ts <csv> [...]"); process.exit(1); }
  const fechasCierre = new Set<string>();
  for (const p of rutas) {
    const text = fs.readFileSync(p, "utf8");
    const kind = detectKarrotMcp(text);
    console.log(path.basename(p), "→", kind);
    if (kind === "credit_notes") {
      const nc = parseCreditNotesCsv(text);
      // la ubicación no viene en este reporte: se toma de la venta (orderReceipt) si está cargada
      for (const n of nc) {
        if (!n.storeCode && n.orderReceipt) {
          const venta = await prisma.sale.findFirst({ where: { invoice: n.orderReceipt, source: "karrot", storeCode: { not: null } }, orderBy: { id: "desc" } });
          if (venta) { n.storeCode = venta.storeCode; n.location = venta.bodega.split(" · ")[0]; }
        }
        await prisma.creditNote.upsert({ where: { ncId: n.ncId }, create: n, update: n });
        console.log(`   NC ${n.ncNumber} ${n.date} ${n.storeCode ?? "?"} venta ${n.orderReceipt} bruto ${fmt(n.gross)} dcto ${fmt(n.discount)} neto ${fmt(n.net)} · ${n.customer}`);
      }
    } else if (kind === "cashier_balance") {
      const cierres = parseCashierBalanceCsv(text);
      for (const c of cierres) {
        await prisma.cashierClose.upsert({ where: { batchId_method: { batchId: c.batchId, method: c.method } }, create: c, update: c });
        fechasCierre.add(c.date);
      }
      console.log(`   ${cierres.length} filas de cierre en ${fechasCierre.size} día(s)`);
    } else {
      console.log("   ⚠ formato no reconocido, se omite");
    }
  }

  // Reconstruir las devoluciones sintéticas de los días cargados
  if (fechasCierre.size) {
    const fechas = [...fechasCierre].sort();
    await prisma.sale.deleteMany({ where: { source: SOURCE_DEVOLUCION, date: { in: fechas } } });
    const cierres = await prisma.cashierClose.findMany({ where: { date: { in: fechas }, returns: { not: 0 }, storeCode: { not: null } } });
    if (cierres.length) {
      await prisma.sale.createMany({
        data: cierres.map((c) => ({
          date: c.date,
          invoice: `DEV-${c.batchId}`,
          bodega: `${c.location} · devolución`,
          storeCode: c.storeCode,
          method: metodoCierre(c.method),
          amount: c.returns, // negativo
          source: SOURCE_DEVOLUCION,
        })),
      });
    }
    for (const c of cierres) console.log(`   DEVOLUCIÓN ${c.date} ${c.storeCode} ${c.method} ${fmt(c.returns)} (${c.user})`);
    // faltantes contados por la asesora (efectivo): sistema vs contado
    const efe = await prisma.cashierClose.findMany({ where: { date: { in: fechas }, method: { contains: "fectivo" } } });
    for (const c of efe) if (Math.abs(c.systemBalance - c.countedBalance) >= 500)
      console.log(`   ⚠ CAJA ${c.date} ${c.storeCode} contado ${fmt(c.countedBalance)} vs sistema ${fmt(c.systemBalance)} → ${fmt(c.countedBalance - c.systemBalance)} (${c.user})`);
  }
  await prisma.$disconnect();
}
main();
