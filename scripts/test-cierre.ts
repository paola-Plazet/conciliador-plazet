// Prueba del cierre de mes: toma un mes limpio, lo cierra directo en BD con su
// foto (como hace el API), verifica que computeLedger sirva los resultados
// congelados, y lo reabre dejando todo como estaba.
import { prisma } from "../src/lib/db";
import { computeLedger } from "../src/lib/ledger";

async function main() {
  const antes = await computeLedger();
  console.log("MESES:");
  for (const m of antes.months) {
    console.log(
      `   ${m.month}  cerrado=${m.closed}  limpio=${m.clean}  ` +
      `(${m.totals.cuadran} cuadran, ${m.totals.diferencias} dif, ${m.totals.sinConciliar} sin conciliar, ${m.totals.manuales} manuales)`,
    );
  }
  const limpio =
    antes.months.find((m) => m.clean && !m.closed) ??
    antes.months.find((m) => !m.closed && m.month === "2026-06");
  if (!limpio) { console.log("\nNo hay mes para probar."); process.exit(0); }
  const MES = limpio.month;

  const monthOf = (r: { month?: string; depositDate: string }) =>
    r.month ?? r.depositDate.slice(0, 7);
  const resultados = antes.summary.results.filter((r) => monthOf(r) === MES);
  console.log(`\nCerrando ${MES} (${resultados.length} resultados en la foto)…`);
  await prisma.monthStatus.upsert({
    where: { month: MES },
    create: { month: MES, closed: true, closedAt: new Date(), closedBy: "test", snapshotJson: JSON.stringify(resultados) },
    update: { closed: true, closedAt: new Date(), closedBy: "test", snapshotJson: JSON.stringify(resultados) },
  });

  const despues = await computeLedger();
  const servidos = despues.summary.results.filter((r) => monthOf(r) === MES);
  const mismos =
    servidos.length === resultados.length &&
    JSON.stringify([...servidos].sort((a, b) => a.id.localeCompare(b.id))) ===
      JSON.stringify([...resultados].sort((a, b) => a.id.localeCompare(b.id)));
  console.log(`Foto servida congelada: ${mismos ? "OK ✔" : "FALLÓ ✘"} (${servidos.length} resultados)`);
  const mm = despues.months.find((x) => x.month === MES);
  console.log(`Overview del mes: cerrado=${mm?.closed} limpio=${mm?.clean}`);
  // totales globales consistentes
  const t = despues.summary.totals;
  const check =
    t.cuadran === despues.summary.results.filter((r) => r.status === "CUADRA").length;
  console.log(`Totales recontados: ${check ? "OK ✔" : "FALLÓ ✘"}`);

  console.log(`\nReabriendo ${MES} (revertir prueba)…`);
  await prisma.monthStatus.update({
    where: { month: MES },
    data: { closed: false, closedAt: null, closedBy: null, snapshotJson: "[]" },
  });
  const final = await computeLedger();
  const mf = final.months.find((x) => x.month === MES);
  console.log(`Estado final: cerrado=${mf?.closed} — todo como estaba.`);
  process.exit(0);
}
main();
