// Cruce INVERSO: cada venta que el POS registró como Rappi (Linux / Alegra / Karrot)
// ¿existe en alguna liquidación de Rappi (report*.xlsx de Downloads)?
import * as XLSX from "xlsx";
import fs from "node:fs";
import { prisma } from "../src/lib/db";
const dir = "C:/Users/Paola Agreda/Downloads";
const fmt = (n: number) => "$" + Math.round(n).toLocaleString("es-CO");
const MES: Record<string, string> = { ene: "01", feb: "02", mar: "03", abr: "04", may: "05", jun: "06", jul: "07", ago: "08", sep: "09", oct: "10", nov: "11", dic: "12" };
const fecha = (s: string) => { const m = s.match(/(\d{1,2}) (\w{3})\.? (\d{4})/); return m ? `${m[3]}-${MES[m[2].toLowerCase()]}-${m[1].padStart(2, "0")}` : null; };
const tienda = (n: string) => { const t = n.toUpperCase(); if (!t.includes("PLAZET")) return null; if (t.includes("AMÉRICAS") || t.includes("AMERICAS")) return "B1"; if (t.includes("OCCIDENTE") && !t.includes("ÉXITO") && !t.includes("EXITO")) return "B2"; if (t.includes("NORTE")) return "B3"; if (t.includes("JARD")) return "JP"; return null; };
const dias = (a: string, b: string) => Math.round((Date.parse(a) - Date.parse(b)) / 86400000);
async function main() {
  const ordenes: { st: string; date: string; amount: number; id: string; pago: string; met: string; used: boolean }[] = [];
  const periodos: [string, string][] = [];
  for (const n of fs.readdirSync(dir).filter((x) => /^report( \(\d+\))?\.xlsx$/i.test(x))) {
    const wb = XLSX.readFile(dir + "/" + n);
    const res = XLSX.utils.sheet_to_json<any[]>(wb.Sheets["Resumen"], { header: 1, raw: false, defval: "" });
    const fila = res.find((x) => String(x[3] ?? "").match(/^\d{8}$/)); if (!fila) continue;
    const pago = String(fila[3]); if (periodos.some((p) => p[0] === pago)) continue; // duplicado
    const [d0, d1] = String(fila[4]).split(" - "); periodos.push([pago, `${d0}→${d1}`]);
    for (const o of XLSX.utils.sheet_to_json<any[]>(wb.Sheets["1. Ventas por Orden"], { header: 1, raw: false, defval: "" }).slice(3)) {
      const st = o[1] && tienda(String(o[2])); const d = o[5] && fecha(String(o[5]));
      if (st && d) ordenes.push({ st, date: d, amount: Number(String(o[7]).replace(/[^\d.-]/g, "")), id: String(o[1]), pago, met: String(o[6]), used: false });
    }
  }
  const cubierto = (d: string) => periodos.some(([, r]) => { const [a, b] = r.split("→"); return d >= a && d <= b; });
  console.log("Liquidaciones:", periodos.map((p) => p[1]).sort().join(" · "), "| órdenes Plazet:", ordenes.length);
  const ventas = await prisma.sale.findMany({ where: { method: "OTRO", bodega: { contains: "appi" }, date: { gte: "2026-04-01", lte: "2026-05-31" }, storeCode: { not: null } }, orderBy: [{ date: "asc" }, { storeCode: "asc" }] });
  const res: Record<string, { n: number; v: number }> = {};
  const cuenta = (k: string, v: number) => { res[k] = res[k] ?? { n: 0, v: 0 }; res[k].n++; res[k].v += v; };
  console.log(`\nVentas POS como Rappi (abr–may, ${ventas.length}):`);
  for (const v of ventas) {
    const TOL = 1000; // Rappi liquida unos pesos menos que el precio del POS (350/600/900 vistos)
    const cands = ordenes.filter((o) => !o.used && o.st === v.storeCode && Math.abs(o.amount - v.amount) <= TOL && Math.abs(dias(o.date, v.date)) <= 2);
    const score = (o: (typeof ordenes)[number]) => Math.abs(o.amount - v.amount) * 10 + Math.abs(dias(o.date, v.date));
    let best = cands[0]; for (const c of cands) if (score(c) < score(best)) best = c;
    let estado: string;
    if (best) { best.used = true; const dif = Math.round(best.amount - v.amount); estado = `${dif === 0 ? "✓" : "≈"} orden ${best.id} ${best.date === v.date ? "mismo día" : "del " + best.date.slice(5)}${dif === 0 ? "" : ` por ${fmt(best.amount)} (Rappi ${dif > 0 ? "+" : ""}${dif})`} (${best.met}, liq ${best.pago})`; cuenta(dif === 0 ? "✓ exacta en Rappi" : "≈ en Rappi con dif ≤1.000", v.amount); }
    else if (!cubierto(v.date)) { estado = "· sin liquidación de esa fecha para verificar"; cuenta("· sin liquidación", v.amount); }
    else { estado = v.bodega.toUpperCase().includes("ADDI") ? "✗ NO está en Rappi (bodega 'Rappi / Addi': ¿fue Addi?)" : "✗ NO está en Rappi"; cuenta("✗ no está", v.amount); }
    console.log(`   ${v.date} ${v.storeCode} ${fmt(v.amount).padStart(10)} fac ${String(v.invoice).padEnd(12)} [${v.source.padEnd(6)}] ${v.bodega.slice(0, 32).padEnd(32)} → ${estado}`);
  }
  console.log("\nRESUMEN:", Object.entries(res).map(([k, x]) => `${k}: ${x.n} (${fmt(x.v)})`).join(" | "));
  const sobran = ordenes.filter((o) => !o.used && o.date >= "2026-04-24");
  console.log(`\nÓrdenes Rappi (desde 24-abr) que NO calzaron con ninguna venta Rappi del POS: ${sobran.length}`);
  for (const o of sobran) {
    const d0 = new Date(Date.parse(o.date + 'T00:00:00Z') - 86400000).toISOString().slice(0, 10), d1 = new Date(Date.parse(o.date + 'T00:00:00Z') + 86400000).toISOString().slice(0, 10);
    const cerca = await prisma.sale.findMany({ where: { storeCode: o.st, date: { gte: d0, lte: d1 }, amount: { gte: o.amount - 1000, lte: o.amount + 1000 } } });
    console.log(`   ${o.st} ${o.date} ${fmt(o.amount).padStart(10)} ${o.met.padEnd(18)} orden ${o.id} → ${cerca.length ? cerca.map((c) => `POS ${c.date.slice(5)} ${c.method}${c.method === 'OTRO' ? '(' + c.bodega.split(' · ').pop() + ')' : ''} fac ${c.invoice} ${fmt(c.amount)}`).join(' / ') : 'nada parecido en el POS (±1.000, ±1 día)'}`);
  }
  await prisma.$disconnect();
}
main();
