// ¿Cuánto limpió la reclasificación por Alegra (Rappi/Addi, MP, Nequi) en los QR sin pago de mayo?
import { prisma } from "../src/lib/db";
import { CUENTAS_NO_QR, ALEGRA_CONFIABLE_HASTA } from "../src/lib/alegra-api";
const fmt = (n: number) => "$" + Math.round(n).toLocaleString("es-CO");
const diaDif = (a: string, b: string) => Math.abs(Math.round((Date.parse(a + "T00:00:00Z") - Date.parse(b + "T00:00:00Z")) / 86400000));
async function main() {
  const cortes = await Promise.all([
    prisma.sale.findFirst({ orderBy: { date: "desc" } }),
    prisma.qrEntry.findFirst({ orderBy: { date: "desc" } }),
    prisma.mercadopagoEntry.findFirst({ orderBy: { date: "desc" } }),
    prisma.dataphoneEntry.findFirst({ orderBy: { txDate: "desc" } }),
    prisma.bankEntry.findFirst({ orderBy: { date: "desc" } }),
    prisma.alegraPago.findFirst({ orderBy: { date: "desc" } }),
    prisma.shopifyOrder.findFirst({ orderBy: { date: "desc" } }),
  ]);
  console.log("CORTES: ventas", cortes[0]?.date, "| QR banco", cortes[1]?.date, "| MP", cortes[2]?.date, "| datafono", cortes[3]?.txDate, "| banco efectivo", cortes[4]?.date, "| alegraPago", cortes[5]?.date, "| shopify", cortes[6]?.date);
  const alegraT = await prisma.alegraPago.findMany({ where: { metodo: "transfer" } });
  for (const m of ["2026-05", "2026-06", "2026-07", "2026-08", "2026-09"]) {
    const salesRows = await prisma.sale.findMany({ where: { method: "TRANSFERENCIA", date: { startsWith: m } } });
    const qrRows = await prisma.qrEntry.findMany({ where: { date: { startsWith: m } } });
    const otraPorClave = new Map<string, string[]>();
    for (const a of alegraT) {
      if (a.date > ALEGRA_CONFIABLE_HASTA || !a.date.startsWith(m) || !CUENTAS_NO_QR.includes(a.cuenta)) continue;
      const k = `${a.date}|${Math.round(a.amount)}`; const arr = otraPorClave.get(k) ?? []; arr.push(a.cuenta); otraPorClave.set(k, arr);
    }
    const otra = new Map<number, string>();
    for (const s of salesRows) { const arr = otraPorClave.get(`${s.date}|${Math.round(s.amount)}`); if (arr?.length) otra.set(s.id, arr.shift()!); }
    const ventas = salesRows.filter((s) => s.storeCode && !otra.has(s.id)).map((s) => ({ date: s.date, store: s.storeCode as string, amount: Math.round(s.amount), used: false, why: "" }));
    const byAmount = new Map<number, typeof ventas>();
    for (const v of ventas) { const a = byAmount.get(v.amount) ?? []; a.push(v); byAmount.set(v.amount, a); }
    const bank = new Map<number, { date: string; used: boolean }[]>();
    for (const q of qrRows) { const a = Math.round(q.amount); const arr = bank.get(a) ?? []; arr.push({ date: q.date, used: false }); bank.set(a, arr); }
    for (const [amount, vs] of byAmount) {
      const pagos = bank.get(amount); if (!pagos?.length) continue;
      const tiendas = new Set(vs.map((v) => v.store));
      if (tiendas.size >= 2 && pagos.length < vs.length) continue;
      for (const v of vs) { let best = -1, bestD = 99; pagos.forEach((p, i) => { if (!p.used) { const dd = diaDif(p.date, v.date); if (dd <= 6 && dd < bestD) { best = i; bestD = dd; } } }); if (best >= 0) { pagos[best].used = true; v.used = true; } }
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
    const cutQr = cortes[1]?.date;
    const pend = ventas.filter((v) => !v.used && (!cutQr || v.date <= cutQr));
    const recl = [...otra.values()].reduce((acc, c) => { acc[c] = (acc[c] ?? 0) + 1; return acc; }, {} as Record<string, number>);
    console.log(`\n${m}: reclasificadas por Alegra ${otra.size} ${JSON.stringify(recl)} · ventas QR ${ventas.length} · sin pago ${pend.length} ${fmt(pend.reduce((s, p) => s + p.amount, 0))}`);
    const porTienda = new Map<string, typeof pend>();
    for (const p of pend) { const a = porTienda.get(p.store) ?? []; a.push(p); porTienda.set(p.store, a); }
    for (const [t, arr] of [...porTienda.entries()].sort()) {
      console.log(`  ${t}: ${arr.length} · ${fmt(arr.reduce((s, p) => s + p.amount, 0))}`);
      for (const p of arr) console.log(`     ${p.date} ${fmt(p.amount)} ${p.why || "sin pago que calce"}`);
    }
  }
  await prisma.$disconnect();
}
main();
