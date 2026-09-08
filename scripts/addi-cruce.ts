// Cruce del reporte de Addi ("Resumen general.xlsx", hoja Transacciones + cancelaciones)
// contra el POS. --aplicar reclasifica a Addi las ventas QR que sí están en Addi.
import * as XLSX from "xlsx";
import { prisma } from "../src/lib/db";
import { reclasificarVenta } from "../src/lib/overrides";
const aplicar = process.argv.includes("--aplicar");
const fmt = (n: number) => "$" + Math.round(n).toLocaleString("es-CO");
const num = (v: any) => Number(String(v).replace(/[^\d.-]/g, "")) || 0;
const tienda = (n: string) => { const t = n.toUpperCase(); if (t.includes("AMERICAS") || t.includes("AMÉRICAS")) return "B1"; if (t.includes("OCCIDENTE") || t.includes("UNIOCC")) return "B2"; if (t.includes("NORTE")) return "B3"; if (t.includes("JARD")) return "JP"; return null; };
const dias = (a: string, b: string) => Math.round((Date.parse(a) - Date.parse(b)) / 86400000);
async function main() {
  const wb = XLSX.readFile("C:/Users/Paola Agreda/Downloads/Resumen general.xlsx");
  const rows = XLSX.utils.sheet_to_json<any[]>(wb.Sheets["Transacciones + cancelaciones"], { header: 1, raw: false, defval: "" });
  const h = rows[5].map((x: any) => String(x).replace(/\s+/g, " ").trim());
  const col = (name: string) => h.findIndex((x: string) => x.toUpperCase().startsWith(name.toUpperCase()));
  const cEstado = col("Estado"), cAliado = col("Nombre del aliado"), cTienda = col("Nombre tienda"), cTipo = col("Tipo de venta"), cOp = col("ID Operación"), cDoc = col("Número de documento"), cFV = col("Fecha de venta"), cFC = col("Fecha cancelación"), cFP = col("Fecha de Pago"), cTot = col("Total Ventas"), cCanc = col("Total Cancelaciones");
  const tx = rows.slice(6).filter((r) => r[cEstado]).map((r) => ({ estado: String(r[cEstado]), aliado: String(r[cAliado]), tiendaNombre: String(r[cTienda]), st: tienda(String(r[cTienda])), tipo: String(r[cTipo]), op: String(r[cOp]), doc: String(r[cDoc]), fecha: String(r[cFV] || r[cFC]), fechaPago: String(r[cFP]), total: num(r[cTot]), canc: num(r[cCanc]), used: false }));
  const porTienda: Record<string, { n: number; v: number }> = {};
  for (const t of tx) { const k = `${t.aliado} | ${t.tiendaNombre} → ${t.st ?? "?"}`; porTienda[k] = porTienda[k] ?? { n: 0, v: 0 }; porTienda[k].n++; porTienda[k].v += t.total + t.canc; }
  console.log("ALIADO | TIENDA → código:");
  for (const [k, x] of Object.entries(porTienda).sort()) console.log(`   ${k.padEnd(70)} ${String(x.n).padStart(4)}  ${fmt(x.v)}`);
  const ventasAddi = tx.filter((t) => t.st && t.estado === "Transacción" && t.fecha >= "2026-04-24");
  console.log(`\nTransacciones Addi de tiendas Plazet desde 24-abr: ${ventasAddi.length} · ${fmt(ventasAddi.reduce((s, t) => s + t.total, 0))}; cancelaciones: ${tx.filter((t) => t.st && t.estado !== "Transacción").length}`);

  // A) ventas del POS marcadas Addi → ¿existen en Addi?
  const pos = await prisma.sale.findMany({ where: { method: "OTRO", bodega: { contains: "ddi" }, date: { gte: "2026-04-24" }, storeCode: { not: null } }, orderBy: [{ date: "asc" }] });
  console.log(`\nA) Ventas POS marcadas Addi (${pos.length}):`);
  const resA: Record<string, number> = {};
  for (const v of pos) {
    const cands = ventasAddi.filter((t) => !t.used && t.st === v.storeCode && Math.abs(t.total - v.amount) <= 1000 && Math.abs(dias(t.fecha, v.date)) <= 2);
    let best = cands[0]; for (const c of cands) if (Math.abs(c.total - v.amount) * 10 + Math.abs(dias(c.fecha, v.date)) < Math.abs(best.total - v.amount) * 10 + Math.abs(dias(best.fecha, v.date))) best = c;
    let estado: string;
    if (best) { best.used = true; const dif = Math.round(best.total - v.amount); estado = `${dif ? "≈" : "✓"} Addi ${best.fecha}${dif ? ` por ${fmt(best.total)} (${dif > 0 ? "+" : ""}${dif})` : ""} · op ${best.op.slice(0, 8)} · pago ${best.fechaPago}`; resA[dif ? "≈" : "✓"] = (resA[dif ? "≈" : "✓"] ?? 0) + 1; }
    else { estado = v.bodega.toUpperCase().includes("RAPPI") ? "✗ no está en Addi (bodega 'Rappi / Addi': ¿fue Rappi?)" : "✗ NO está en Addi"; resA["✗"] = (resA["✗"] ?? 0) + 1; }
    console.log(`   ${v.date} ${v.storeCode} ${fmt(v.amount).padStart(10)} fac ${String(v.invoice).padEnd(12)} [${v.source.padEnd(6)}] ${v.bodega.slice(0, 30).padEnd(30)} → ${estado}`);
  }
  console.log("   resumen A:", JSON.stringify(resA));

  // B) transacciones Addi de Plazet que no calzaron con una venta Addi → ¿qué hay en el POS?
  const sueltas = ventasAddi.filter((t) => !t.used);
  console.log(`\nB) Transacciones Addi sin venta Addi en el POS (${sueltas.length}):`);
  const porReclasificar: { st: string; date: string; invoice: string; amount: number; op: string }[] = [];
  for (const t of sueltas.sort((a, b) => a.fecha.localeCompare(b.fecha))) {
    const d0 = new Date(Date.parse(t.fecha + "T00:00:00Z") - 86400000).toISOString().slice(0, 10), d1 = new Date(Date.parse(t.fecha + "T00:00:00Z") + 2 * 86400000).toISOString().slice(0, 10);
    const cerca = await prisma.sale.findMany({ where: { storeCode: t.st!, date: { gte: d0, lte: d1 }, amount: { gte: t.total - 1000, lte: t.total + 1000 }, source: { not: "karrot_devolucion" } } });
    const qr = cerca.find((c) => c.method === "TRANSFERENCIA" && Math.abs(c.amount - t.total) <= 1);
    if (qr) porReclasificar.push({ st: t.st!, date: qr.date, invoice: qr.invoice, amount: Math.round(qr.amount), op: t.op });
    console.log(`   ${t.st} ${t.fecha} ${fmt(t.total).padStart(10)} ${t.tipo.padEnd(8)} op ${t.op.slice(0, 8)} pago ${t.fechaPago} → ${cerca.length ? cerca.map((c) => `POS ${c.date.slice(5)} ${c.method}${c.method === "OTRO" ? "(" + c.bodega.split(" · ").pop() + ")" : ""} fac ${c.invoice} ${fmt(c.amount)}`).join(" / ") : "nada parecido en el POS"}${qr ? "  ← QR exacto → RECLASIFICAR" : ""}`);
  }
  console.log("\npor reclasificar a Addi (QR exacto):", porReclasificar.length);
  if (aplicar) for (const r of porReclasificar) {
    const f = await reclasificarVenta({ date: r.date, storeCode: r.st, invoice: r.invoice, amount: r.amount, plataforma: "Addi", nota: `Addi op ${r.op.slice(0, 8)} (Resumen general Addi)`, autor: "Claude (cruce reporte Addi)" });
    console.log(`   aplicado: ${r.st} ${r.date} fac ${r.invoice} ${fmt(r.amount)} → Addi (#${f.id})`);
  }
  await prisma.$disconnect();
}
main();
