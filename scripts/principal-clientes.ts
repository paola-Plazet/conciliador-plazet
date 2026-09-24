// Completa Sale.cliente / Sale.orderType de la bodega PRINCIPAL con el reporte
// ALL_SALES del conector de Karrot (JSON armado desde el CSV). Solo UPDATE.
import fs from "fs";
import { prisma } from "../src/lib/db";
type R = { inv: string; ot: string; cli: string };
async function main() {
  const rows: R[] = JSON.parse(fs.readFileSync(process.argv[2] ?? "scripts/.principal-karrot.json", "utf8"));
  let n = 0;
  for (const r of rows) {
    if (r.inv.startsWith("NC")) continue;
    const u = await prisma.sale.updateMany({
      where: { invoice: r.inv, bodega: { startsWith: "PRINCIPAL" } },
      data: { cliente: r.cli || null, orderType: r.ot || null },
    });
    n += u.count;
  }
  console.log("ventas actualizadas:", n);
}
main().finally(() => prisma.$disconnect());
