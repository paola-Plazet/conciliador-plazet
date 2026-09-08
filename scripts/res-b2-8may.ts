import { prisma } from "../src/lib/db";
import { computeLedger } from "../src/lib/ledger";
async function main() {
  const led = await computeLedger();
  for (const r of led.summary.results) if (r.storeCode === "B2" && r.channel === "DATAFONO" && r.salesDates.includes("2026-05-08")) console.log(JSON.stringify(r, null, 0));
  const adj = await prisma.adjustment.findMany({ where: { resultId: { contains: "DATAFONO:B2:2026-05-08" } } });
  console.log("ADJ:", JSON.stringify(adj));
  await prisma.$disconnect();
}
main();
