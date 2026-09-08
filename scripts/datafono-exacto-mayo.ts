import { prisma } from "../src/lib/db";
import { computeLedger } from "../src/lib/ledger";
const fmt = (n: number) => "$" + Math.round(n).toLocaleString("es-CO");
async function main() {
  const led = await computeLedger();
  const rs = led.summary.results.filter((r) => r.channel === "DATAFONO" && r.status === "DIFERENCIA" && (r.month ?? "") >= "2026-05" && (r.month ?? "") <= "2026-06").sort((a, b) => a.depositDate.localeCompare(b.depositDate));
  for (const r of rs) {
    const src = await prisma.sale.groupBy({ by: ["source"], where: { storeCode: r.storeCode!, date: r.depositDate, method: { in: ["TARJETA_CREDITO", "TARJETA_DEBITO"] } }, _count: { _all: true } });
    console.log(`${r.storeCode} ${r.depositDate} venta ${fmt(r.salesAmount).padStart(11)} dat ${fmt(r.depositAmount).padStart(11)} falta ${fmt(r.falta ?? 0).padStart(10)} sobra ${fmt(r.sobra ?? 0).padStart(10)} | filas POS: ${src.map((s) => `${s.source} ${s._count._all}`).join(", ")}`);
  }
  const lin = await prisma.sale.findMany({ where: { source: "linux", storeCode: "B1", date: "2026-05-02", method: { in: ["TARJETA_CREDITO", "TARJETA_DEBITO"] } }, take: 6 });
  console.log("muestra Linux B1 2-may:", lin.map((l) => `${l.invoice} ${fmt(l.amount)}`).join(" | "));
  await prisma.$disconnect();
}
main();
