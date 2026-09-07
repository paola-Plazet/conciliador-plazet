import { prisma } from "../src/lib/db";
const fmt = (n: number) => "$" + Math.round(n).toLocaleString("es-CO");
async function main() {
  const rows = await prisma.sale.findMany({ where: { date: { gte: "2026-08-25" } } });
  const por = new Map<string, { n: number; sum: number }>();
  for (const r of rows) { const k = `${r.date.slice(0, 7)} · ${r.source}`; const a = por.get(k) ?? { n: 0, sum: 0 }; a.n++; a.sum += r.amount; por.set(k, a); }
  for (const [k, a] of [...por.entries()].sort()) console.log(k.padEnd(22), String(a.n).padStart(5), "facturas", fmt(a.sum));
  // ¿hay días con DOS fuentes a la vez? (señal de doble conteo)
  const porDia = new Map<string, Set<string>>();
  for (const r of rows) { const s = porDia.get(r.date) ?? new Set(); s.add(r.source); porDia.set(r.date, s); }
  const dobles = [...porDia.entries()].filter(([, s]) => s.size > 1);
  console.log(dobles.length ? "⚠ Días con 2 fuentes: " + dobles.map(([d, s]) => `${d}(${[...s].join("+")})`).join(" ") : "✓ Ningún día con dos fuentes de ventas a la vez");
  await prisma.$disconnect();
}
main();
