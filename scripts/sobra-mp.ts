import { prisma } from "../src/lib/db";
const fmt = (n: number) => "$" + Math.round(n).toLocaleString("es-CO");
async function main() {
  const [mp, salesM, web] = await Promise.all([
    prisma.mercadopagoEntry.findMany(),
    prisma.sale.findMany({ where: { bodega: { contains: "MERCADO", mode: "insensitive" } } }),
    prisma.shopifyOrder.findMany({ where: { gateway: { contains: "Mercado", mode: "insensitive" } } }),
  ]);
  const por = new Map<string, { rec: number; pos: number; web: number }>();
  const add = (m: string, k: "rec" | "pos" | "web", v: number) => { const a = por.get(m) ?? { rec: 0, pos: 0, web: 0 }; a[k] += v; por.set(m, a); };
  for (const e of mp) add(e.date.slice(0, 7), "rec", e.bruto);
  for (const s of salesM) add(s.date.slice(0, 7), "pos", s.amount);
  for (const w of web) add(w.date.slice(0, 7), "web", w.amount - w.refund);
  console.log("mes · recaudo MP · venta POS-MP · venta WEB · sobra sin web · sobra con web");
  for (const [m, a] of [...por.entries()].sort()) {
    console.log(`${m}  ${fmt(a.rec).padStart(12)}  ${fmt(a.pos).padStart(12)}  ${fmt(a.web).padStart(12)}  ${fmt(a.rec - a.pos).padStart(12)}  ${fmt(a.rec - a.pos - a.web).padStart(12)}`);
  }
  await prisma.$disconnect();
}
main();
