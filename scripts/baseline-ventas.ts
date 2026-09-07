// Foto ANTES de cargar el informe nuevo: cómo está la 7949, últimas cargas, y estado por mes/canal del motor
import { prisma } from "../src/lib/db";
import { computeLedger } from "../src/lib/ledger";
const fmt = (n: number) => "$" + Math.round(n).toLocaleString("es-CO");
async function main() {
  const s7949 = await prisma.sale.findMany({ where: { invoice: "7949" } });
  console.log("SALE 7949:", JSON.stringify(s7949));
  const ups = await prisma.upload.findMany({ orderBy: { id: "desc" }, take: 6 });
  for (const u of ups) console.log("UPLOAD", JSON.stringify(u).slice(0, 220));
  const src = await prisma.sale.groupBy({ by: ["source"], _count: { _all: true }, _min: { date: true }, _max: { date: true } });
  console.log("SOURCES:", JSON.stringify(src));
  const led = await computeLedger();
  const agg = new Map<string, { n: number; dif: number }>();
  for (const r of led.summary.results) {
    const m = r.month ?? r.depositDate.slice(0, 7);
    if (m < "2026-07") continue;
    const k = `${m} ${r.channel} ${r.status}`;
    const a = agg.get(k) ?? { n: 0, dif: 0 }; a.n++; a.dif += r.difference ?? 0; agg.set(k, a);
  }
  for (const [k, a] of [...agg].sort()) console.log(k.padEnd(40), a.n, fmt(a.dif));
  await prisma.$disconnect();
}
main();
