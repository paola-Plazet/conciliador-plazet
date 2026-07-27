// Diagnóstico: lista las corridas guardadas y sus conteos
import { prisma } from "../src/lib/db";

async function main() {
  const runs = await prisma.run.findMany({ orderBy: { id: "desc" }, take: 5 });
  if (runs.length === 0) {
    console.log("No hay corridas en la BD.");
    return;
  }
  for (const r of runs) {
    const results = JSON.parse(r.resultsJson || "{}");
    console.log(
      `Run #${r.id} | ${r.label ?? "(sin label)"} | ${r.createdAt.toISOString()} | periodo ${r.periodStart} -> ${r.periodEnd}` +
        ` | ventas ${JSON.parse(r.salesJson || "[]").length} | banco ${JSON.parse(r.bankJson || "[]").length}` +
        ` | datafono ${JSON.parse(r.dataphoneJson || "[]").length} | qr ${JSON.parse(r.qrBankJson || "[]").length}` +
        ` | resultados ${(results.results ?? []).length}`,
    );
  }
}
main()
  .catch((e) => console.error("ERROR:", e))
  .finally(() => prisma.$disconnect());
