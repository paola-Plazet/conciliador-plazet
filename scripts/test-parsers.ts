import fs from "node:fs";
import { parseAlegra } from "../src/lib/parsers/alegra";
import { parseBanco } from "../src/lib/parsers/banco";
import { parseDatafono } from "../src/lib/parsers/datafono";
import { detectFileType } from "../src/lib/parsers/detect";
import { formatCOP } from "../src/lib/money";

const DIR = "C:\\Users\\Paola Agreda\\OneDrive\\Escritorio\\PROYECTOS PAO\\muestras-conciliacion\\";

const files = {
  alegra: DIR + "Alegra - Facturas - HABBIE SAS -.csv",
  banco: DIR + "movimientos_10030039979 (33).xls",
  datafono: DIR + "901987494_Reporte_Conciliar_20260527_20260625.xlsx",
  datafonoBanco: DIR + "CSV_19100003911_000000901987494_20260625_18101027.csv",
};

console.log("===== DETECCIÓN =====");
for (const [k, p] of Object.entries(files)) {
  const buf = fs.readFileSync(p);
  console.log(`  ${k.padEnd(14)} -> ${detectFileType(p, buf).kind}`);
}

console.log("\n===== ALEGRA =====");
const a = parseAlegra(fs.readFileSync(files.alegra));
console.log("Facturas (dedup):", a.totalInvoices);
console.log("Total ventas:", formatCOP(a.totalAmount));
console.log("Por método:");
for (const [m, v] of Object.entries(a.byMethod)) console.log(`   ${m.padEnd(18)} ${formatCOP(v)}`);
// por tienda
const byStore: Record<string, number> = {};
for (const s of a.sales) byStore[s.storeCode ?? "?"] = (byStore[s.storeCode ?? "?"] ?? 0) + s.amount;
console.log("Por tienda:", Object.entries(byStore).map(([k, v]) => `${k}=${formatCOP(v)}`).join("  "));
if (a.warnings.length) console.log("Avisos:", a.warnings);

console.log("\n===== BANCO EFECTIVO =====");
const b = parseBanco(fs.readFileSync(files.banco));
console.log("Movimientos:", b.entries.length);
console.log("Total ingresos (positivos):", formatCOP(b.totalIngresos));
console.log("Total RECAUDO EFECTIVO:", formatCOP(b.totalRecaudoEfectivo));
console.log("Referencias de efectivo:");
for (const r of b.references) console.log(`   ${r.reference.padEnd(18)} ${String(r.count).padStart(3)}x  ${formatCOP(r.total)}`);

console.log("\n===== DATAFONO CONCILIAR =====");
const d = parseDatafono(fs.readFileSync(files.datafono));
console.log("Transacciones:", d.entries.length);
console.log("Total bruto (VALOR TOTAL):", formatCOP(d.totalGross));
console.log("Total neto (VALOR NETO):", formatCOP(d.totalNet));
const dByStore: Record<string, number> = {};
for (const e of d.entries) dByStore[e.storeCode ?? "?"] = (dByStore[e.storeCode ?? "?"] ?? 0) + e.gross;
console.log("Bruto por tienda:", Object.entries(dByStore).map(([k, v]) => `${k}=${formatCOP(v)}`).join("  "));
if (d.warnings.length) console.log("Avisos:", d.warnings);
