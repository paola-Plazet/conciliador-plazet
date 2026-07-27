// Verificación del bug de días saltados/repetidos (Unicentro B3, junio).
// Cada día de venta debe aparecer en EXACTAMENTE una consignación.
import { computeLedger } from "../src/lib/ledger";
import { prisma } from "../src/lib/db";
import { formatCOP } from "../src/lib/money";

async function main() {
  const { summary } = await computeLedger();
  const b3 = summary.results
    .filter((r) => r.channel === "EFECTIVO" && r.storeCode === "B3" && r.depositDate >= "2026-06-01")
    .sort((a, b) => a.depositDate.localeCompare(b.depositDate));

  console.log("EFECTIVO Unicentro (B3) junio:");
  const seen = new Map<string, number>();
  for (const r of b3) {
    console.log(
      `  dep ${r.depositDate} ${formatCOP(r.depositAmount).padStart(13)} | ventas [${r.salesDates.join(",")}] ${formatCOP(r.salesAmount).padStart(13)} | dif ${formatCOP(r.difference).padStart(12)} | ${r.status}${r.qrAlert ? " ¿QR?" : ""}`,
    );
    for (const d of r.salesDates) seen.set(d, (seen.get(d) ?? 0) + 1);
  }

  // días de venta B3 de junio en la BD
  const sales = await prisma.sale.findMany({ where: { storeCode: "B3", method: "EFECTIVO", date: { gte: "2026-06-01", lte: "2026-06-30" } } });
  const salesDays = [...new Set(sales.map((s) => s.date))].sort();
  const pend = summary.pendings.find((p) => p.storeCode === "B3");
  const pendDays = new Set(pend?.days.map((d) => d.date) ?? []);

  console.log("\nVerificación por día:");
  let ok = true;
  for (const d of salesDays) {
    const n = seen.get(d) ?? 0;
    const isPend = pendDays.has(d);
    if (n === 1 && !isPend) continue;
    if (n === 0 && isPend) continue; // pendiente por consignar, correcto
    ok = false;
    console.log(`  ${d}: aparece en ${n} consignación(es)${isPend ? " y en pendientes" : ""} ← PROBLEMA`);
  }
  console.log(ok ? "✔ Todos los días aparecen exactamente una vez (o están en pendientes)." : "✘ Hay días saltados o repetidos.");
  if (pend) console.log(`Pendientes B3: ${pend.days.map((d) => d.date).join(", ")}`);
}
main().finally(() => prisma.$disconnect());
