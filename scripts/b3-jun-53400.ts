import { NextRequest } from "next/server";
import { prisma } from "../src/lib/db";
import { GET as datDia } from "../src/app/api/datafono-dia/route";
const fmt = (n: number) => "$" + Math.round(n).toLocaleString("es-CO");
async function main() {
  const v = await prisma.sale.findMany({ where: { storeCode: "B3", date: { startsWith: "2026-06" }, amount: { in: [53400, 8500] } } });
  console.log("VENTAS B3 junio 53.400 / 8.500:", v.map((x) => `${x.date} ${x.method} ${fmt(x.amount)} fac ${x.invoice} aut ${x.autorizacion ?? "-"} 4d ${x.ultimos4 ?? "-"}`).join(" | "));
  const d = await prisma.dataphoneEntry.findMany({ where: { storeCode: "B3", txDate: { startsWith: "2026-06" }, gross: { in: [53400, 8500] } } });
  console.log("DATÁFONO B3 junio 53.400 / 8.500:", d.map((x) => `${x.txDate} ${fmt(x.gross)} ${x.franchise} ${x.cardType} aut ${x.autorizacion ?? "-"} 4d ${x.ultimos4 ?? "-"}`).join(" | "));
  const fechas = new Set([...v.map((x) => x.date), ...d.map((x) => x.txDate)]);
  for (const f of [...fechas].sort()) {
    const r = (await (await datDia(new NextRequest(`http://localhost/api/datafono-dia?date=${f}&store=B3`))).json()) as any;
    console.log(`\n${f}: POS ${fmt(r.totales.pos)} datáfono ${fmt(r.totales.datafono)} dif ${fmt(r.totales.dif)} aut=${r.tieneAutorizacion}`);
    for (const p of r.pos) if (!p.match || p.match.difValor !== 0 || [53400, 8500].includes(Math.round(p.amount))) console.log(`   POS fac ${p.invoice} ${fmt(p.amount)} aut ${p.autorizacion ?? "-"} → ${p.match ? `${p.match.via} ${fmt(p.match.gross)} aut ${p.match.autorizacion ?? "-"} dif ${p.match.difValor}` : "SIN datáfono"}`);
    for (const s of r.sueltas) console.log(`   DATÁFONO sin POS ${fmt(s.gross)} ${s.franchise} ${s.cardType} aut ${s.autorizacion ?? "-"}`);
  }
  await prisma.$disconnect();
}
main();
