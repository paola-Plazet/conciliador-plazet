// Diagnóstico caso Mariana (movida de Unicentro B3 → Plaza B1):
// consignaciones de agosto con referencia B3/B1/desconocida, y estado del
// motor EFECTIVO en ambas tiendas, para detectar la consignación que quedó
// con referencia equivocada y probar el cruce.
//   npx tsx scripts/mariana-cruce.ts [2026-08]
import { prisma } from "../src/lib/db";
import { computeLedger } from "../src/lib/ledger";
import { loadRefMap } from "../src/lib/process";

const MES = process.argv[2] ?? "2026-08";
const fmt = (n: number) => "$" + Math.round(n).toLocaleString("es-CO");

async function main() {
  const refMap = await loadRefMap();

  const banco = await prisma.bankEntry.findMany({
    where: { date: { gte: `${MES}-01`, lte: `${MES}-31` }, kind: "RECAUDO_EFECTIVO" },
    orderBy: { date: "asc" },
  });
  console.log(`CONSIGNACIONES EFECTIVO ${MES} (todas):`);
  for (const b of banco) {
    const tienda = b.reference ? refMap.get(b.reference) ?? "??" : "sin ref";
    console.log(
      `   id ${String(b.id).padStart(5)}  ${b.date}  ${fmt(b.amount).padStart(13)}  ref ${String(b.reference).padEnd(12)} → ${tienda}`,
    );
  }

  const { summary } = await computeLedger();
  for (const store of ["B3", "B1"]) {
    console.log(`\nMOTOR EFECTIVO ${store} — ${MES}:`);
    const res = summary.results.filter(
      (r) => r.channel === "EFECTIVO" && r.storeCode === store &&
        (r.month ?? r.depositDate?.slice(0, 7)) === MES,
    );
    for (const r of res.sort((a, b) => (a.depositDate ?? "").localeCompare(b.depositDate ?? ""))) {
      const dias = [...(r.salesDates ?? [])].sort();
      console.log(
        `   dep ${r.depositDate ?? "—"} ${fmt(r.depositAmount ?? 0).padStart(13)}  cubre ${dias.join(", ") || "—"}  ` +
        `venta ${fmt(r.salesAmount ?? 0)}  dif ${fmt(r.difference)}  [${r.status}${r.late ? " tardía" : ""}]${r.note ? "  · " + r.note : ""}`,
      );
    }
    // ventas efectivo por día del mes, para ver qué días quedaron sin cubrir
    const ventas = await prisma.sale.findMany({
      where: { storeCode: store, method: "EFECTIVO", date: { gte: `${MES}-01`, lte: `${MES}-31` } },
    });
    const porDia = new Map<string, number>();
    for (const v of ventas) porDia.set(v.date, (porDia.get(v.date) ?? 0) + v.amount);
    console.log(`   Ventas efectivo por día:`);
    for (const [d, v] of [...porDia].sort()) console.log(`      ${d}  ${fmt(v).padStart(13)}`);
  }
  process.exit(0);
}
main();
