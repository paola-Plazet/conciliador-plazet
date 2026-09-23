// Llena Sale.vendedor en ventas Karrot ya cargadas SIN recargarlas (no toca montos
// ni fechas): lee CSV del conector (ALL_SALES_DETAIL_PAYMENT_METHOD) y actualiza por
// (tienda, factura, fecha).   npx tsx scripts/vendedor-backfill.ts <csv...>
import fs from "fs";
import { parseKarrotPagos } from "../src/lib/parsers/karrot-pagos";
import { prisma } from "../src/lib/db";

async function main() {
  const quien = new Map<string, string>(); // store|invoice|date -> vendedor
  for (const f of process.argv.slice(2)) {
    const { sales } = parseKarrotPagos(fs.readFileSync(f));
    for (const s of sales) if (s.vendedor) quien.set(`${s.storeCode ?? ""}|${s.invoice}|${s.date}`, s.vendedor);
  }
  const fechas = [...quien.keys()].map((k) => k.split("|")[2]).sort();
  const ventas = await prisma.sale.findMany({
    where: { source: "karrot", vendedor: null, date: { gte: fechas[0], lte: fechas[fechas.length - 1] } },
    select: { id: true, storeCode: true, invoice: true, date: true },
  });
  const porVendedor = new Map<string, number[]>();
  let sin = 0;
  for (const v of ventas) {
    const n = quien.get(`${v.storeCode ?? ""}|${v.invoice}|${v.date}`);
    if (!n) { sin++; continue; }
    porVendedor.set(n, [...(porVendedor.get(n) ?? []), v.id]);
  }
  let ok = 0;
  for (const [n, ids] of porVendedor) ok += (await prisma.sale.updateMany({ where: { id: { in: ids } }, data: { vendedor: n } })).count;
  console.log(`${fechas[0]} → ${fechas[fechas.length - 1]}: ${ok} ventas con vendedora · ${sin} sin pareja en el CSV`);
  process.exit(0);
}
main();
