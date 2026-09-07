import { prisma } from "../src/lib/db";
import { computeLedger } from "../src/lib/ledger";
const fmt = (n: number) => "$" + Math.round(n).toLocaleString("es-CO");
async function main() {
  const l = await computeLedger();
  console.log("CORTES:", JSON.stringify(l.cut));
  const qr25 = await prisma.qrEntry.findMany({ where: { date: "2026-08-25" } });
  console.log(`QR 25-ago: ${qr25.length} pagos (buscando los 4 perdidos: 109900/138100/97700/99800 →`,
    [109900, 138100, 97700, 99800].map((v) => (qr25.some((q) => Math.round(q.amount) === v) ? "✓" : "✗" + v)).join(" "), ")");
  const qrDesde = await prisma.qrEntry.count({ where: { date: { gte: "2026-08-26" } } });
  console.log("QR desde 26-ago:", qrDesde);
  const ultimas = await prisma.upload.findMany({ orderBy: { createdAt: "desc" }, take: 8 });
  console.log("Últimas cargas:");
  for (const u of ultimas) console.log("  ", u.createdAt.toISOString().slice(0, 16), u.kind.padEnd(16), u.filename.slice(0, 40), `${u.rows} filas`, u.dateFrom, "→", u.dateTo);
  for (const m of l.months.slice(0, 3)) console.log(`${m.month}: cuadran ${m.totals.cuadran} · man ${m.totals.manuales} · dif ${m.totals.diferencias} · sin ${m.totals.sinConciliar}`);
  await prisma.$disconnect();
}
main();
