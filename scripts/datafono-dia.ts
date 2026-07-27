// Detalle DATÁFONO de un día de una tienda: cada venta con tarjeta del POS vs
// cada transacción de Plink, cruzadas por valor para ver cuál sobra/falta.
//   npx tsx scripts/datafono-dia.ts B3 2026-07-03 [2026-07-04 ...]
import { prisma } from "../src/lib/db";
import { storeName } from "../src/lib/stores";

const STORE = process.argv[2] ?? "B3";
const DIAS = process.argv.slice(3).length ? process.argv.slice(3) : ["2026-07-03"];
const fmt = (n: number) => "$" + Math.round(n).toLocaleString("es-CO");

async function main() {
  for (const dia of DIAS) {
    const ventas = (
      await prisma.sale.findMany({
        where: { storeCode: STORE, date: dia, method: { in: ["TARJETA_DEBITO", "TARJETA_CREDITO"] } },
      })
    ).map((v) => ({ ...v, amount: Math.round(v.amount), used: false }));
    const plink = (
      await prisma.dataphoneEntry.findMany({ where: { storeCode: STORE, txDate: dia } })
    ).map((p) => ({ ...p, gross: Math.round(p.gross), used: false }));

    // cruce por valor exacto (luego ±$500)
    for (const tol of [0, 500]) {
      for (const v of ventas) {
        if (v.used) continue;
        const i = plink.findIndex((p) => !p.used && Math.abs(p.gross - v.amount) <= tol);
        if (i >= 0) { v.used = true; plink[i].used = true; }
      }
    }

    const tv = ventas.reduce((a, v) => a + v.amount, 0);
    const tp = plink.reduce((a, p) => a + p.gross, 0);
    console.log(`\n══ ${storeName(STORE)} — ${dia}   venta POS ${fmt(tv)} vs Plink ${fmt(tp)}   dif ${fmt(tv - tp)}`);
    const vSin = ventas.filter((v) => !v.used);
    const pSin = plink.filter((p) => !p.used);
    if (!vSin.length && !pSin.length) { console.log("   todo cruza uno a uno ✓"); continue; }
    if (vSin.length) {
      console.log("   VENTAS del POS sin transacción en Plink:");
      for (const v of vSin.sort((a, b) => b.amount - a.amount))
        console.log(`      ✗ ${fmt(v.amount).padStart(12)}  fac ${v.invoice}`);
    }
    if (pSin.length) {
      console.log("   TRANSACCIONES Plink sin venta en el POS:");
      for (const p of pSin.sort((a, b) => b.gross - a.gross))
        console.log(`      ✗ ${fmt(p.gross).padStart(12)}  ${p.franchise} ${p.cardType}  term ${p.terminal}`);
    }
  }
  process.exit(0);
}
main();
