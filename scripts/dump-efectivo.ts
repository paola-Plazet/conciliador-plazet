import fs from "node:fs";
import { prisma } from "../src/lib/db";
import { computeLedger } from "../src/lib/ledger";
async function main() {
  const led = await computeLedger();
  const rows = led.summary.results.filter((r) => r.channel === "EFECTIVO").map((r) => ({ id: r.id, store: r.storeCode, dep: r.depositDate, depAmt: Math.round(r.depositAmount), dias: r.salesDates.join("+"), venta: Math.round(r.salesAmount), dif: Math.round(r.difference), status: r.status }));
  fs.writeFileSync(process.argv[2], JSON.stringify(rows, null, 0));
  console.log("dump", process.argv[2], rows.length);
  await prisma.$disconnect();
}
main();
