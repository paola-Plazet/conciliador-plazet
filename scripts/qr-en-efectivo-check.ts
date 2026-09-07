import { prisma } from "../src/lib/db";
import { computeLedger } from "../src/lib/ledger";
const fmt = (n: number) => "$" + Math.round(n).toLocaleString("es-CO");
async function main() {
  // ¿los QR mal contabilizados están en el banco?
  const casos: [string, number][] = [["2026-05-16", 63450], ["2026-05-17", 89700], ["2026-05-17", 22550], ["2026-05-29", 150000], ["2026-06-01", 227800], ["2026-06-02", 219800], ["2026-06-03", 132600], ["2026-06-08", 151800], ["2026-06-11", 70600], ["2026-06-16", 72500], ["2026-06-16", 27050], ["2026-06-17", 64700], ["2026-06-17", 13900], ["2026-06-19", 10500], ["2026-06-20", 65720], ["2026-06-21", 80300], ["2026-06-22", 69500]];
  for (const [d, m] of casos) {
    const d0 = new Date(Date.parse(d + "T00:00:00Z") - 2 * 86400000).toISOString().slice(0, 10);
    const q = await prisma.qrEntry.findMany({ where: { date: { gte: d0, lte: d }, amount: { gte: m - 500, lte: m + 500 } } });
    const v = await prisma.sale.findMany({ where: { date: d, storeCode: "B1", amount: { gte: m - 1, lte: m + 1 } } });
    console.log(`${d} ${fmt(m).padStart(10)} → banco QR: ${q.length ? q.map((x) => `${x.date} ${fmt(x.amount)} ${x.payer}`).join(" / ") : "NO"} | en BD hoy: ${v.map((x) => `${x.method} fac ${x.invoice}`).join(", ") || "—"}`);
  }
  const led = await computeLedger();
  console.log("\nEFECTIVO B1 mayo 14–20 y junio 15–18 (estado actual):");
  for (const r of led.summary.results) if (r.storeCode === "B1" && r.channel === "EFECTIVO" && r.salesDates.some((x) => (x >= "2026-05-14" && x <= "2026-05-20") || (x >= "2026-06-15" && x <= "2026-06-18")))
    console.log(`   ${r.salesDates.join("+")} → ${r.status} dif ${fmt(r.difference ?? 0)} ${r.note ?? ""}`);
  await prisma.$disconnect();
}
main();
