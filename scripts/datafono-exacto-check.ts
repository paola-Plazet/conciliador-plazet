import { prisma } from "../src/lib/db";
import { computeLedger } from "../src/lib/ledger";
const fmt = (n: number) => "$" + Math.round(n).toLocaleString("es-CO");
async function main() {
  const led = await computeLedger();
  const casos = [["B3", "2026-06-28"], ["B2", "2026-05-08"], ["B3", "2026-09-02"], ["B3", "2026-06-23"]];
  for (const [st, d] of casos) for (const r of led.summary.results) if (r.channel === "DATAFONO" && r.storeCode === st && r.salesDates.includes(d)) console.log(`${st} ${d}: ${r.status} venta ${fmt(r.salesAmount)} datáfono ${fmt(r.depositAmount)} falta ${fmt(r.falta ?? 0)} sobra ${fmt(r.sobra ?? 0)} — ${r.note ?? ""}`);
  const agg = new Map<string, { n: number; falta: number; sobra: number }>();
  for (const r of led.summary.results) { if (r.channel !== "DATAFONO") continue; const m = r.month ?? r.depositDate.slice(0, 7); if (m < "2026-05") continue; const k = `${m} ${r.status}`; const a = agg.get(k) ?? { n: 0, falta: 0, sobra: 0 }; a.n++; a.falta += r.falta ?? 0; a.sobra += r.sobra ?? 0; agg.set(k, a); }
  for (const [k, a] of [...agg].sort()) console.log(k.padEnd(28), a.n, "falta", fmt(a.falta), "sobra", fmt(a.sobra));
  for (const m of led.months) console.log(`   ${m.month}  cuadran ${m.totals.cuadran} | dif ${m.totals.diferencias} | sin conciliar ${m.totals.sinConciliar}${m.closed ? " (CERRADO)" : ""}`);
  await prisma.$disconnect();
}
main();
