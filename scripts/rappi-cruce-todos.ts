// Cruza TODAS las órdenes Rappi de tiendas Plazet (liquidaciones report*.xlsx de
// Downloads, deduplicadas por ID de pago) contra las ventas del POS. Con --aplicar
// reclasifica a Rappi las que el POS registró como QR.
import * as XLSX from "xlsx";
import fs from "node:fs";
import { prisma } from "../src/lib/db";
import { reclasificarVenta } from "../src/lib/overrides";
const dir = "C:/Users/Paola Agreda/Downloads";
const aplicar = process.argv.includes("--aplicar");
const fmt = (n: number) => "$" + Math.round(n).toLocaleString("es-CO");
const MES: Record<string, string> = { ene: "01", feb: "02", mar: "03", abr: "04", may: "05", jun: "06", jul: "07", ago: "08", sep: "09", oct: "10", nov: "11", dic: "12" };
const fecha = (s: string) => { const m = s.match(/(\d{1,2}) (\w{3})\.? (\d{4})/); return m ? `${m[3]}-${MES[m[2].toLowerCase()]}-${m[1].padStart(2, "0")}` : null; };
const tienda = (n: string) => { const t = n.toUpperCase(); if (!t.includes("PLAZET")) return null; if (t.includes("AMÉRICAS") || t.includes("AMERICAS")) return "B1"; if (t.includes("OCCIDENTE")) return "B2"; if (t.includes("NORTE")) return "B3"; if (t.includes("JARD")) return "JP"; return "?"; };
async function main() {
  const files = fs.readdirSync(dir).filter((n) => /^report( \(\d+\))?\.xlsx$/i.test(n));
  const pagos = new Map<string, { file: string; periodo: string; ordenes: any[][] }>();
  const nombres = new Set<string>();
  for (const n of files) {
    const wb = XLSX.readFile(dir + "/" + n);
    const res = XLSX.utils.sheet_to_json<any[]>(wb.Sheets["Resumen"], { header: 1, raw: false, defval: "" });
    const fila = res.find((x) => String(x[3] ?? "").match(/^\d{8}$/));
    if (!fila) continue;
    const ordenes = XLSX.utils.sheet_to_json<any[]>(wb.Sheets["1. Ventas por Orden"], { header: 1, raw: false, defval: "" }).slice(3).filter((x) => x[1]);
    for (const o of ordenes) nombres.add(String(o[2]));
    pagos.set(String(fila[3]), { file: n, periodo: String(fila[4]), ordenes });
  }
  console.log("Tiendas en los archivos:", [...nombres].join(" | "));
  const resumen: Record<string, number> = {};
  const porReclasificar: { st: string; date: string; invoice: string; amount: number; orden: string; pago: string }[] = [];
  for (const [pago, p] of [...pagos].sort((a, b) => a[1].periodo.localeCompare(b[1].periodo))) {
    console.log(`\n== Liquidación ${pago} · ${p.periodo} (${p.file})`);
    for (const o of p.ordenes) {
      const st = tienda(String(o[2])); if (!st) continue;
      const d = fecha(String(o[5])); const monto = Number(String(o[7]).replace(/[^\d.-]/g, "")); const met = o[6]; const id = String(o[1]);
      if (!d) { console.log("   ⚠ fecha ilegible", o[5]); continue; }
      const d1 = new Date(Date.parse(d + "T00:00:00Z") + 86400000).toISOString().slice(0, 10);
      const ventas = await prisma.sale.findMany({ where: { storeCode: st, date: { in: [d, d1] }, amount: { gte: monto - 1, lte: monto + 1 } }, orderBy: { date: "asc" } });
      let estado: string;
      const qr = ventas.find((v) => v.method === "TRANSFERENCIA");
      const ok = ventas.find((v) => v.method === "OTRO" && v.bodega.toUpperCase().includes("RAPPI"));
      if (ok) estado = `✓ ya es Rappi (fac ${ok.invoice}${ok.source === "linux" ? ", Linux" : ""})`;
      else if (qr) { estado = `✗ QR en POS (fac ${qr.invoice} ${qr.date}) → RECLASIFICAR`; porReclasificar.push({ st, date: qr.date, invoice: qr.invoice, amount: monto, orden: id, pago }); }
      else if (ventas.length) estado = `⚠ en POS como ${ventas.map((v) => `${v.method} fac ${v.invoice} ${v.date}${v.source === "linux" ? " (Linux)" : ""}`).join(" / ")}`;
      else estado = "— sin venta en POS ese día ni el siguiente";
      const k = estado.slice(0, 1); resumen[k] = (resumen[k] ?? 0) + 1;
      console.log(`   ${st} ${d} ${fmt(monto).padStart(10)} ${String(met).padEnd(4)} orden ${id} → ${estado}`);
    }
  }
  console.log("\nRESUMEN:", JSON.stringify(resumen), "| por reclasificar:", porReclasificar.length);
  if (aplicar) for (const r of porReclasificar) {
    const f = await reclasificarVenta({ date: r.date, storeCode: r.st, invoice: r.invoice, amount: r.amount, plataforma: "Rappi", nota: `Orden Rappi ${r.orden} (liquidación ${r.pago})`, autor: "Claude (cruce liquidación Rappi)" });
    console.log(`   aplicado: ${r.st} ${r.date} fac ${r.invoice} ${fmt(r.amount)} → Rappi (#${f.id})`);
  }
  await prisma.$disconnect();
}
main();
