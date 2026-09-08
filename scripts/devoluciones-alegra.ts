import fs from "node:fs";
import { parse } from "csv-parse/sync";
import { prisma } from "../src/lib/db";
const fmt = (n: number) => "$" + Math.round(n).toLocaleString("es-CO");
const iso = (d: string) => { const m = d.match(/(\d{2})\/(\d{2})\/(\d{4})/); return m ? `${m[3]}-${m[2]}-${m[1]}` : d; };
const num = (v: any) => Number(String(v ?? "").replace(/[^\d.-]/g, "")) || 0;
const tienda = (cc: string, bodega: string) => { const t = (cc + " " + bodega).toUpperCase(); if (t.includes("AMERICAS") || t.includes("AMÉRICAS")) return "B1"; if (t.includes("UNIOCC")) return "B2"; if (t.includes("UNICENTRO NORTE") || t.includes("PLAZET UNICENTRO")) return "B3"; if (t.includes("JARD")) return "JP"; return null; };
async function main() {
  const text = fs.readFileSync("C:/Users/Paola Agreda/Downloads/Alegra - devoluciones desde 01_04_2026 - hasta 08_07_2026.csv", "utf8").replace(/^sep=;\r?\n/, "");
  const rows: Record<string, string>[] = parse(text, { columns: true, delimiter: ";", skip_empty_lines: true, bom: true, relax_column_count: true, relax_quotes: true });
  const col = (r: Record<string, string>, name: string) => { const k = Object.keys(r).find((x) => x.replace(/[^A-Z\s\-()%]/gi, "").toUpperCase().replace(/\s+/g, " ").trim() === name); return k ? r[k] : ""; };
  const ncs = new Map<string, any>();
  for (const r of rows) {
    const n = col(r, "NMERO") || r["NÚMERO"] || Object.values(r)[0];
    if (ncs.has(n)) continue;
    const venta = col(r, "VENTA ASOCIADA"); const fac = venta.match(/:\s*([A-Z]+\d+)/)?.[1] ?? "";
    ncs.set(n, { n, fecha: iso(col(r, "FECHA")), estado: col(r, "ESTADO"), tipo: col(r, "TIPO"), bodega: col(r, "BODEGA"), cc: col(r, "CENTRO DE COSTO"), fac, total: num(col(r, "TOTAL - NOTA")), porAplicar: num(col(r, "POR APLICAR")), razon: col(r, "RAZN") || col(r, "RAZÓN"), cliente: col(r, "CLIENTE - NOMBRE") });
  }
  console.log("Notas crédito (únicas):", ncs.size, "| filas ítem:", rows.length);
  const porMes: Record<string, { n: number; v: number }> = {};
  for (const nc of ncs.values()) { const k = `${nc.fecha.slice(0, 7)} ${tienda(nc.cc, nc.bodega) ?? "?"}`; porMes[k] = porMes[k] ?? { n: 0, v: 0 }; porMes[k].n++; porMes[k].v += nc.total; }
  console.log("por mes/tienda:", Object.entries(porMes).sort().map(([k, x]) => `${k}: ${x.n} ${fmt(x.v)}`).join(" | "));
  console.log("\nTODAS (fecha, tienda, factura, total, tipo, estado, razón) + método original de la factura en la BD:");
  for (const nc of [...ncs.values()].sort((a, b) => a.fecha.localeCompare(b.fecha))) {
    const st = tienda(nc.cc, nc.bodega);
    const orig = st && nc.fac ? await prisma.sale.findFirst({ where: { invoice: nc.fac, storeCode: st } }) : null;
    console.log(`   NC${String(nc.n).padStart(3)} ${nc.fecha} ${(st ?? "?").padEnd(2)} fac ${nc.fac.padEnd(7)} ${fmt(nc.total).padStart(10)} ${nc.estado.padEnd(8)} ${nc.tipo.slice(0, 22).padEnd(22)} ${(nc.razon || "").slice(0, 18).padEnd(18)} → factura en BD: ${orig ? `${orig.date} ${orig.method} ${fmt(orig.amount)} [${orig.source}]` : "no está"}`);
  }
  await prisma.$disconnect();
}
main();
