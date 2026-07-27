// Detalle QR de un día de una tienda: cada venta QR del POS vs los pagos QR
// del banco de días cercanos que aún no cruzan con nadie (para ver qué falta).
//   npx tsx scripts/qr-dia-detalle.ts B1 2026-07-22
import { prisma } from "../src/lib/db";
import { storeName } from "../src/lib/stores";

const STORE = process.argv[2] ?? "B1";
const DIA = process.argv[3] ?? "2026-07-22";
const fmt = (n: number) => "$" + Math.round(n).toLocaleString("es-CO");
const dd = (a: string, b: string) =>
  Math.round((Date.parse(a + "T00:00:00Z") - Date.parse(b + "T00:00:00Z")) / 86400000);

async function main() {
  const mes = DIA.slice(0, 7);
  // todas las ventas QR del mes (para saber qué pagos del banco ya cruzan con otra venta)
  const ventasMes = await prisma.sale.findMany({ where: { method: "TRANSFERENCIA", date: { startsWith: mes } } });
  const pagosMes = await prisma.qrEntry.findMany({ where: { date: { startsWith: mes } } });

  // replica el cruce del tablero: exacto con conteo + casi-exacto por fecha
  const ventas = ventasMes
    .filter((v) => v.storeCode)
    .map((v) => ({ ...v, amount: Math.round(v.amount), used: false }));
  const pagos = pagosMes.map((p) => ({ ...p, amount: Math.round(p.amount), used: false }));
  const byAmountV = new Map<number, typeof ventas>();
  for (const v of ventas) byAmountV.set(v.amount, [...(byAmountV.get(v.amount) ?? []), v]);
  const byAmountP = new Map<number, typeof pagos>();
  for (const p of pagos) byAmountP.set(p.amount, [...(byAmountP.get(p.amount) ?? []), p]);

  for (const [amount, vs] of byAmountV) {
    const ps = byAmountP.get(amount) ?? [];
    const tiendas = new Set(vs.map((v) => v.storeCode));
    if (tiendas.size >= 2 && ps.length < vs.length) continue;
    for (const v of vs) {
      let best = -1, bestD = 99;
      ps.forEach((p, i) => {
        if (p.used) return;
        const d = Math.abs(dd(p.date, v.date));
        if (d <= 6 && d < bestD) { best = i; bestD = d; }
      });
      if (best >= 0) { ps[best].used = true; v.used = true; }
    }
  }
  for (const p of pagos.filter((p) => !p.used).sort((a, b) => a.date.localeCompare(b.date))) {
    const cands = ventas.filter((v) => !v.used && Math.abs(v.amount - p.amount) <= 500 && Math.abs(dd(v.date, p.date)) <= 6);
    if (!cands.length) continue;
    const clave = (c: (typeof cands)[number]) => Math.abs(dd(c.date, p.date)) * 1000 + Math.abs(c.amount - p.amount);
    let best = cands[0];
    for (const c of cands) if (clave(c) < clave(best)) best = c;
    if (new Set(cands.filter((c) => clave(c) === clave(best)).map((c) => c.storeCode)).size > 1) continue;
    p.used = true; best.used = true;
  }

  console.log(`QR ${storeName(STORE)} — ${DIA}\n`);
  console.log("VENTAS QR del día (✓ = cruzó con un pago del banco):");
  let totV = 0, totSin = 0;
  for (const v of ventas.filter((v) => v.storeCode === STORE && v.date === DIA).sort((a, b) => b.amount - a.amount)) {
    console.log(`   ${v.used ? "✓" : "✗"} ${fmt(v.amount).padStart(12)}   fac ${v.invoice}`);
    totV += v.amount;
    if (!v.used) totSin += v.amount;
  }
  console.log(`   total ${fmt(totV)} · sin cruzar ${fmt(totSin)}\n`);

  console.log(`PAGOS QR del banco SIN cruzar con ninguna venta (${DIA} ±3 días):`);
  let totP = 0;
  for (const p of pagos.filter((p) => !p.used && Math.abs(dd(p.date, DIA)) <= 3).sort((a, b) => a.date.localeCompare(b.date) || b.amount - a.amount)) {
    console.log(`   ${p.date}  ${fmt(p.amount).padStart(12)}   ${p.payer}`);
    totP += p.amount;
  }
  console.log(`   total sin cruzar en la ventana: ${fmt(totP)}`);
  process.exit(0);
}
main();
