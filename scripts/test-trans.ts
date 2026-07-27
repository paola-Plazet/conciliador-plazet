// Prueba end-to-end con el reporte de TRANSACCIONES de Alegra como fuente de
// ventas (reemplaza al de facturas) + banco efectivo + datafono + CSV 191 (QR).

import fs from "node:fs";
import { detectFileType } from "../src/lib/parsers/detect";
import { parseAlegraTrans } from "../src/lib/parsers/alegra-trans";
import { parseDatafonoBanco } from "../src/lib/parsers/datafono-banco";
import { processFiles } from "../src/lib/process";
import { formatCOP } from "../src/lib/money";
import { storeName } from "../src/lib/stores";

const MUESTRAS = "C:\\Users\\Paola Agreda\\OneDrive\\Escritorio\\PROYECTOS PAO\\muestras-conciliacion\\";
const files = {
  alegraTrans: "C:\\Users\\Paola Agreda\\Downloads\\Alegra - Reporte de transacciones - HABBIE SAS -.xlsx",
  banco: MUESTRAS + "movimientos_10030039979 (33).xls",
  datafono: MUESTRAS + "901987494_Reporte_Conciliar_20260527_20260625.xlsx",
  datafonoBanco: MUESTRAS + "CSV_19100003911_000000901987494_20260625_18101027.csv",
};

async function main() {
  console.log("===== DETECCIÓN =====");
  const bufs: Record<string, Buffer> = {};
  for (const [k, p] of Object.entries(files)) {
    bufs[k] = fs.readFileSync(p);
    console.log(`  ${k.padEnd(14)} -> ${detectFileType(p, bufs[k]).kind}`);
  }

  console.log("\n===== TRANSACCIONES ALEGRA =====");
  const t = parseAlegraTrans(bufs.alegraTrans);
  console.log("Transacciones:", t.totalInvoices, "| Total:", formatCOP(t.totalAmount));
  for (const [m, v] of Object.entries(t.byMethod)) console.log(`   ${m.padEnd(18)} ${formatCOP(v)}`);
  const byStore: Record<string, number> = {};
  for (const s of t.sales.filter((x) => x.method === "EFECTIVO"))
    byStore[s.storeCode ?? "?"] = (byStore[s.storeCode ?? "?"] ?? 0) + s.amount;
  console.log("Efectivo por tienda:", Object.entries(byStore).map(([k, v]) => `${storeName(k === "?" ? null : k)}=${formatCOP(v)}`).join("  "));
  const cardByStore: Record<string, number> = {};
  for (const s of t.sales.filter((x) => x.method === "TARJETA_CREDITO" || x.method === "TARJETA_DEBITO"))
    cardByStore[s.storeCode ?? "?"] = (cardByStore[s.storeCode ?? "?"] ?? 0) + s.amount;
  console.log("Tarjetas por tienda:", Object.entries(cardByStore).map(([k, v]) => `${storeName(k === "?" ? null : k)}=${formatCOP(v)}`).join("  "));
  if (t.warnings.length) console.log("Avisos:", t.warnings);

  console.log("\n===== BANCO DATAFONO (CSV 191) =====");
  const q = parseDatafonoBanco(bufs.datafonoBanco);
  console.log("Pagos QR:", q.qr.length, "| Total QR:", formatCOP(q.totalQr), "| Abonos tarjeta (neto):", formatCOP(q.totalAbonosTarjeta));

  console.log("\n===== CONCILIACIÓN COMPLETA =====");
  const out = await processFiles({
    alegraTrans: bufs.alegraTrans,
    banco: bufs.banco,
    datafono: bufs.datafono,
    datafonoBanco: bufs.datafonoBanco,
  });
  console.log("Periodo:", out.periodStart, "->", out.periodEnd);
  console.log("Totales:", out.summary.totals);
  for (const ch of ["EFECTIVO", "DATAFONO", "QR"] as const) {
    const rs = out.summary.results.filter((r) => r.channel === ch);
    const ok = rs.filter((r) => r.status === "CUADRA").length;
    const dif = rs.filter((r) => r.status === "DIFERENCIA").length;
    const sin = rs.filter((r) => r.status === "SIN_CONCILIAR").length;
    console.log(`  ${ch.padEnd(9)} ${String(rs.length).padStart(3)} registros | cuadran ${ok} | diferencias ${dif} | sin conciliar ${sin}`);
  }
  console.log("\nQR detalle:");
  for (const r of out.summary.results.filter((r) => r.channel === "QR").slice(0, 12)) {
    console.log(`  ${r.depositDate}  banco=${formatCOP(r.depositAmount).padStart(14)}  pos=${formatCOP(r.salesAmount).padStart(14)}  dif=${formatCOP(r.difference).padStart(12)}  ${r.status}`);
  }
  if (out.warnings.length) console.log("\nAvisos:", out.warnings);
}

main().then(() => process.exit(0));
