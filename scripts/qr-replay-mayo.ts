// Réplica exacta de la asignación QR→tienda del dashboard para mayo-2026
import { prisma } from "../src/lib/db";
const fmt = (n: number) => "$" + Math.round(n).toLocaleString("es-CO");
const diaDif = (a: string, b: string) => Math.abs(Math.round((Date.parse(a + "T00:00:00Z") - Date.parse(b + "T00:00:00Z")) / 86400000));
async function main() {
  const m = "2026-05";
  const salesRows = await prisma.sale.findMany({ where: { method: "TRANSFERENCIA", date: { startsWith: m } } });
  const qrRows = await prisma.qrEntry.findMany({ where: { date: { startsWith: m } } });
  const qrSalesList = salesRows.filter((s) => s.storeCode).map((s) => ({ date: s.date, store: s.storeCode as string, amount: Math.round(s.amount), used: false }));
  const qrByAmount = new Map<number, typeof qrSalesList>();
  for (const s of qrSalesList) { const a = qrByAmount.get(s.amount) ?? []; a.push(s); qrByAmount.set(s.amount, a); }
  const bankByAmount = new Map<number, { date: string; used: boolean }[]>();
  for (const q of qrRows) { const a = Math.round(q.amount); const arr = bankByAmount.get(a) ?? []; arr.push({ date: q.date, used: false }); bankByAmount.set(a, arr); }
  const asig: string[] = []; const qrBancoDia = new Map<string, number>();
  const add = (k: string, v: number) => qrBancoDia.set(k, (qrBancoDia.get(k) ?? 0) + v);
  for (const [amount, ventas] of qrByAmount) {
    const pagos = bankByAmount.get(amount); if (!pagos || pagos.length === 0) continue;
    const tiendas = new Set(ventas.map((v) => v.store));
    if (tiendas.size >= 2 && pagos.length < ventas.length) continue;
    for (const v of ventas) {
      let best = -1, bestD = 99;
      pagos.forEach((p, i) => { if (p.used) return; const dd = diaDif(p.date, v.date); if (dd <= 6 && dd < bestD) { best = i; bestD = dd; } });
      if (best >= 0) { pagos[best].used = true; v.used = true; add(`${v.store}|${v.date}`, amount); asig.push(`P1 ${fmt(amount)} → ${v.store} ${v.date}`); }
    }
  }
  const qrRevisar: string[] = [];
  const pagosLibres = [...bankByAmount].flatMap(([amount, arr]) => arr.filter((p) => !p.used).map((p) => ({ ref: p, amount }))).sort((a, b) => a.ref.date.localeCompare(b.ref.date));
  for (const { ref, amount } of pagosLibres) {
    const cands = qrSalesList.filter((v) => !v.used && Math.abs(v.amount - amount) <= 500 && diaDif(v.date, ref.date) <= 6);
    if (cands.length === 0) continue;
    const clave = (c: (typeof cands)[number]) => diaDif(c.date, ref.date) * 1000 + Math.abs(c.amount - amount);
    let best = cands[0]; for (const c of cands) if (clave(c) < clave(best)) best = c;
    const emp = cands.filter((c) => clave(c) === clave(best));
    if (new Set(emp.map((c) => c.store)).size > 1) { qrRevisar.push(`REVISAR pago ${ref.date} ${fmt(amount)} entre ${[...new Set(cands.map((c) => c.store))].join("/")}`); continue; }
    ref.used = true; best.used = true; add(`${best.store}|${best.date}`, amount); asig.push(`P2 ${fmt(amount)} (${ref.date}) → ${best.store} ${best.date}`);
  }
  console.log("Asignaciones que tocan el 07-may o valores 66100/35650/20600:");
  for (const a of asig) if (a.includes("05-07") || a.includes("66.100") || a.includes("35.650") || a.includes("20.600")) console.log("  ", a);
  console.log("\nB1|2026-05-07 asignado:", fmt(qrBancoDia.get("B1|2026-05-07") ?? 0), "· ventas B1 ese día:", fmt(qrSalesList.filter((v) => v.store === "B1" && v.date === "2026-05-07").reduce((s, v) => s + v.amount, 0)));
  console.log("\nPor revisar:"); for (const r of qrRevisar) console.log("  ", r);
  await prisma.$disconnect();
}
main();
