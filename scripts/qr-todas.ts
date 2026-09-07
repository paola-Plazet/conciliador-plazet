// Revisión QR de TODAS las tiendas: por mes, días donde la venta QR no quedó
// cubierta por pagos del banco, con la razón (ambiguo / sin pago / total).
import { prisma } from "../src/lib/db";
const fmt = (n: number) => "$" + Math.round(n).toLocaleString("es-CO");
const diaDif = (a: string, b: string) => Math.abs(Math.round((Date.parse(a + "T00:00:00Z") - Date.parse(b + "T00:00:00Z")) / 86400000));
async function main() {
  const cutQr = (await prisma.qrEntry.findFirst({ orderBy: { date: "desc" } }))?.date;
  console.log("corte QR banco:", cutQr);
  for (const m of ["2026-05", "2026-06", "2026-07", "2026-08", "2026-09"]) {
    const salesRows = await prisma.sale.findMany({ where: { method: "TRANSFERENCIA", date: { startsWith: m } } });
    const qrRows = await prisma.qrEntry.findMany({ where: { date: { startsWith: m } } });
    const ventas = salesRows.filter((s) => s.storeCode).map((s) => ({ date: s.date, store: s.storeCode as string, amount: Math.round(s.amount), used: false, why: "" }));
    const byAmount = new Map<number, typeof ventas>();
    for (const v of ventas) { const a = byAmount.get(v.amount) ?? []; a.push(v); byAmount.set(v.amount, a); }
    const bank = new Map<number, { date: string; used: boolean }[]>();
    for (const q of qrRows) { const a = Math.round(q.amount); const arr = bank.get(a) ?? []; arr.push({ date: q.date, used: false }); bank.set(a, arr); }
    for (const [amount, vs] of byAmount) {
      const pagos = bank.get(amount); if (!pagos?.length) continue;
      const tiendas = new Set(vs.map((v) => v.store));
      if (tiendas.size >= 2 && pagos.length < vs.length) continue;
      for (const v of vs) {
        let best = -1, bestD = 99;
        pagos.forEach((p, i) => { if (!p.used) { const dd = diaDif(p.date, v.date); if (dd <= 6 && dd < bestD) { best = i; bestD = dd; } } });
        if (best >= 0) { pagos[best].used = true; v.used = true; }
      }
    }
    const libres = [...bank].flatMap(([amount, arr]) => arr.filter((p) => !p.used).map((p) => ({ ref: p, amount }))).sort((a, b) => a.ref.date.localeCompare(b.ref.date));
    for (const { ref, amount } of libres) {
      const cands = ventas.filter((v) => !v.used && Math.abs(v.amount - amount) <= 500 && diaDif(v.date, ref.date) <= 6);
      if (!cands.length) continue;
      const clave = (c: (typeof cands)[number]) => diaDif(c.date, ref.date) * 1000 + Math.abs(c.amount - amount);
      let best = cands[0]; for (const c of cands) if (clave(c) < clave(best)) best = c;
      const emp = cands.filter((c) => clave(c) === clave(best));
      if (new Set(emp.map((c) => c.store)).size > 1) { for (const c of cands) if (!c.why) c.why = "AMBIGUO entre " + [...new Set(cands.map((x) => x.store))].join("/"); continue; }
      ref.used = true; best.used = true;
    }
    const pend = ventas.filter((v) => !v.used && (!cutQr || v.date <= cutQr));
    if (!pend.length) { console.log(`\n${m}: ✓ todas las ventas QR de todas las tiendas quedaron cubiertas`); continue; }
    const porTienda = new Map<string, typeof pend>();
    for (const p of pend) { const a = porTienda.get(p.store) ?? []; a.push(p); porTienda.set(p.store, a); }
    console.log(`\n${m}: ${pend.length} ventas QR sin pago asignado · ${fmt(pend.reduce((s, p) => s + p.amount, 0))}`);
    for (const [t, arr] of [...porTienda.entries()].sort()) {
      console.log(`  ${t}: ${arr.length} · ${fmt(arr.reduce((s, p) => s + p.amount, 0))}`);
      for (const p of arr.slice(0, 6)) console.log(`     ${p.date} ${fmt(p.amount)} ${p.why || "sin pago que calce"}`);
      if (arr.length > 6) console.log(`     … +${arr.length - 6} más`);
    }
  }
  await prisma.$disconnect();
}
main();
