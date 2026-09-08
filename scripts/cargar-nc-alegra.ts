// Carga las notas crédito de Alegra (CSV "Alegra - devoluciones ...") en CreditNote (ncId alegra-N).
// Total = suma de "ÍTEM - TOTAL" (con IVA) por nota; "TOTAL - NOTA" del CSV viene sin IVA.
// No crea ventas negativas: 40/41 son anulaciones de facturas cuyo pago ya no está en el POS.
import fs from "node:fs";
import { parse } from "csv-parse/sync";
import { prisma } from "../src/lib/db";
const fmt = (n: number) => "$" + Math.round(n).toLocaleString("es-CO");
const iso = (d: string) => { const m = d.match(/(\d{2})\/(\d{2})\/(\d{4})/); return m ? `${m[3]}-${m[2]}-${m[1]}` : d; };
const num = (v: string) => { const s = String(v ?? "").trim(); if (!s) return 0; const t = s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s; return Number(t) || 0; };
const tienda = (cc: string) => { const t = cc.toUpperCase(); if (t.includes("AMERICAS") || t.includes("AMÉRICAS")) return "B1"; if (t.includes("UNIOCC")) return "B2"; if (t.includes("PLAZET UNICENTRO")) return "B3"; if (t.includes("JARD")) return "JP"; return null; };
async function main() {
  const f = process.argv[2] ?? "C:/Users/Paola Agreda/Downloads/Alegra - devoluciones desde 01_04_2026 - hasta 08_07_2026.csv";
  const text = fs.readFileSync(f, "utf8").replace(/^sep=;\r?\n/, "");
  const rows: Record<string, string>[] = parse(text, { columns: true, delimiter: ";", skip_empty_lines: true, bom: true, relax_column_count: true, relax_quotes: true });
  const keys = Object.keys(rows[0]);
  const k = (name: string) => keys.find((x) => x.replace(/[^A-Z\s\-()]/gi, "").toUpperCase().replace(/\s+/g, " ").trim().includes(name))!;
  const kNum = keys[0], kFecha = k("FECHA"), kEstado = keys.find((x) => x === "ESTADO")!, kTipo = keys.find((x) => x === "TIPO")!, kCC = k("CENTRO DE COSTO"), kVenta = k("VENTA ASOCIADA"), kItem = k("TEM - TOTAL"), kCliente = k("CLIENTE - NOMBRE"), kRazon = keys.find((x) => x.toUpperCase().startsWith("RAZ"))!;
  const ncs = new Map<string, { n: string; fecha: string; estado: string; tipo: string; cc: string; fac: string; total: number; cliente: string; razon: string }>();
  for (const r of rows) {
    const n = r[kNum]; const e = ncs.get(n);
    const item = num(r[kItem]);
    if (e) { e.total += item; continue; }
    ncs.set(n, { n, fecha: iso(r[kFecha]), estado: r[kEstado], tipo: r[kTipo], cc: r[kCC], fac: (r[kVenta].match(/:\s*([A-Z]+\d+)/) ?? [])[1] ?? "", total: item, cliente: r[kCliente], razon: r[kRazon] });
  }
  let n = 0;
  for (const nc of ncs.values()) {
    const st = tienda(nc.cc);
    const data = { ncNumber: nc.n, date: nc.fecha, storeCode: st, location: nc.cc, invoice: nc.fac, orderReceipt: "", gross: nc.total, discount: 0, net: nc.total, customer: `${nc.cliente} · ${nc.tipo.slice(0, 40)}${nc.razon ? " · " + nc.razon.slice(0, 60) : ""}` };
    await prisma.creditNote.upsert({ where: { ncId: `alegra-${nc.n}` }, create: { ncId: `alegra-${nc.n}`, ...data }, update: data });
    n++;
    console.log(`NC${nc.n.padStart(3)} ${nc.fecha} ${(st ?? "?").padEnd(2)} fac ${nc.fac.padEnd(7)} ${fmt(nc.total).padStart(10)} ${nc.tipo.slice(0, 28)}`);
  }
  console.log("guardadas:", n);
  // nota de revisión para la única devolución parcial con factura vigente en el POS
  const nota = "Devolución parcial (nota crédito Alegra NC19 del 13-jun): la factura B21018 por $72.200 en efectivo devolvió $32.450. No se descontó del efectivo porque el faltante del grupo 13–15 jun ($104.700) coincide con un QR de DEYSON HERRERA ($104.880 el 14-jun). Revisar si la devolución fue en efectivo.";
  const existe = await prisma.dayNote.findFirst({ where: { date: "2026-06-14", storeCode: "B2", note: { startsWith: "Devolución parcial (nota crédito" } } });
  if (!existe) await prisma.dayNote.create({ data: { date: "2026-06-14", storeCode: "B2", channel: "efectivo", note: nota, autor: "Claude" } });
  await prisma.$disconnect();
}
main();
