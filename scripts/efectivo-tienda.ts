// Detalle del canal EFECTIVO de una tienda en un mes: ventas en efectivo por
// día, consignaciones del banco mapeadas a esa tienda, y cómo el motor las
// agrupó. Sirve para auditar a mano una diferencia.
//   npx tsx scripts/efectivo-tienda.ts B1 2026-07 2026-07-19
import { prisma } from "../src/lib/db";
import { computeLedger } from "../src/lib/ledger";
import { loadRefMap } from "../src/lib/process";
import { storeName } from "../src/lib/stores";

const STORE = process.argv[2] ?? "B1";
const MES = process.argv[3] ?? "2026-07";
const HASTA = process.argv[4] ?? `${MES}-31`;
const fmt = (n: number) => "$" + Math.round(n).toLocaleString("es-CO");

async function main() {
  const refMap = await loadRefMap();
  // ventas efectivo por día
  const ventas = await prisma.sale.findMany({
    where: { storeCode: STORE, method: "EFECTIVO", date: { gte: `${MES}-01`, lte: HASTA } },
  });
  const porDia = new Map<string, number>();
  for (const v of ventas) porDia.set(v.date, (porDia.get(v.date) ?? 0) + v.amount);

  console.log(`EFECTIVO ${storeName(STORE)} (${STORE}) — ${MES} hasta ${HASTA}\n`);
  console.log("VENTAS en efectivo por día:");
  let totalVenta = 0;
  for (const [d, v] of [...porDia].sort()) { console.log(`   ${d}  ${fmt(v).padStart(14)}`); totalVenta += v; }
  console.log(`   ${"TOTAL".padEnd(10)}  ${fmt(totalVenta).padStart(14)}`);

  // consignaciones del banco mapeadas a esta tienda
  const banco = await prisma.bankEntry.findMany({
    where: { date: { gte: `${MES}-01`, lte: HASTA } },
  });
  const dep = banco.filter((b) => b.reference && refMap.get(b.reference) === STORE);
  console.log("\nCONSIGNACIONES del banco a esta tienda:");
  let totalDep = 0;
  for (const b of dep.sort((a, b) => a.date.localeCompare(b.date))) {
    console.log(`   ${b.date}  ${fmt(b.amount).padStart(14)}   ref ${b.reference}  ${b.concept.slice(0, 30)}`);
    totalDep += b.amount;
  }
  console.log(`   ${"TOTAL".padEnd(10)}  ${fmt(totalDep).padStart(14)}`);
  console.log(`\n   CONSIGNADO − VENTA = ${fmt(totalDep - totalVenta)}  (positivo = consignaron DE MÁS; negativo = falta por consignar)`);

  // cómo lo agrupó el motor
  const { summary } = await computeLedger();
  const res = summary.results.filter(
    (r) => r.channel === "EFECTIVO" && r.storeCode === STORE &&
      (r.month ?? r.depositDate.slice(0, 7)) === MES && r.depositDate <= HASTA,
  );
  console.log("\nCÓMO LO CONCILIÓ EL MOTOR (grupo de ventas → consignación):");
  for (const r of res.sort((a, b) => a.depositDate.localeCompare(b.depositDate))) {
    const dias = [...r.salesDates].sort();
    console.log(
      `   dep ${r.depositDate} ${fmt(r.depositAmount).padStart(13)}  cubre ${dias.join(", ") || "—"}  ` +
      `venta ${fmt(r.salesAmount ?? 0)}  dif ${fmt(r.difference)}  [${r.status}${r.late ? " tardía" : ""}]`,
    );
  }
  process.exit(0);
}
main();
