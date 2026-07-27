// Radiografía de un día de una tienda: efectivo, datáfono y QR de ese día,
// con las ventas que lo componen. Para entender un símbolo de alerta.
//   npx tsx scripts/dia-tienda.ts B1 2026-07-02
import { prisma } from "../src/lib/db";
import { storeName } from "../src/lib/stores";

const STORE = process.argv[2] ?? "B1";
const DIA = process.argv[3] ?? "2026-07-02";
const fmt = (n: number) => "$" + Math.round(n).toLocaleString("es-CO");

async function main() {
  console.log(`${storeName(STORE)} (${STORE}) — ${DIA}\n`);

  const ventas = await prisma.sale.findMany({ where: { storeCode: STORE, date: DIA } });
  const porMet = new Map<string, number>();
  for (const v of ventas) porMet.set(v.method, (porMet.get(v.method) ?? 0) + v.amount);
  console.log("VENTAS del día por método:");
  for (const [m, v] of porMet) console.log(`   ${m.padEnd(16)} ${fmt(v).padStart(14)}`);

  const efeVenta = porMet.get("EFECTIVO") ?? 0;
  const tarVenta = (porMet.get("TARJETA_DEBITO") ?? 0) + (porMet.get("TARJETA_CREDITO") ?? 0);

  // datáfono Plink de ese día
  const plinkRows = await prisma.dataphoneEntry.findMany({ where: { storeCode: STORE, txDate: DIA } });
  const plink = plinkRows.reduce((a, d) => a + d.gross, 0);
  console.log("\nDATÁFONO:");
  console.log(`   venta tarjeta POS   ${fmt(tarVenta).padStart(14)}`);
  console.log(`   Plink (bruto)       ${fmt(plink).padStart(14)}   (${plinkRows.length} transacciones)`);
  console.log(`   DIFERENCIA          ${fmt(tarVenta - plink).padStart(14)}   ${Math.abs(tarVenta - plink) >= 1000 ? "⚠ ≥ $1.000 → prende alerta" : "ok"}`);

  process.exit(0);
}
main();
