// Diagnóstico rápido de un mes: por tienda y canal, qué cuadra y qué no.
//   npx tsx scripts/estado-mes.ts 2026-07
import { computeLedger } from "../src/lib/ledger";
import { storeName } from "../src/lib/stores";

const MES = process.argv[2] ?? "2026-07";
const fmt = (n: number) => "$" + Math.round(n).toLocaleString("es-CO");

async function main() {
  const { summary, cut } = await computeLedger();
  const res = summary.results.filter((r) => (r.month ?? r.depositDate.slice(0, 7)) === MES);

  console.log(`ESTADO ${MES}   (cortes: ventas ${cut.sales} · banco ${cut.bank} · QR ${cut.qr} · datáfono ${cut.datafono})\n`);

  const porEstado = new Map<string, number>();
  for (const r of res) porEstado.set(r.status, (porEstado.get(r.status) ?? 0) + 1);
  console.log("Por estado:", [...porEstado].map(([k, v]) => `${k}=${v}`).join("  "));

  const canales = [...new Set(res.map((r) => r.channel))];
  for (const canal of canales) {
    const rc = res.filter((r) => r.channel === canal);
    console.log(`\n── ${canal} ──`);
    const probl = rc.filter((r) => r.status === "DIFERENCIA" || r.status === "SIN_CONCILIAR");
    if (probl.length === 0) { console.log("   todo cuadra ✓"); continue; }
    for (const r of probl.sort((a, b) => (a.storeCode ?? "").localeCompare(b.storeCode ?? "") || a.depositDate.localeCompare(b.depositDate))) {
      const dias = [...r.salesDates].sort();
      const rango = dias.length ? `${dias[0]}${dias.length > 1 ? "…" + dias[dias.length - 1] : ""}` : "-";
      console.log(
        `   ${storeName(r.storeCode).padEnd(20)} ${r.status.padEnd(13)} venta ${rango.padEnd(24)} dep ${r.depositDate}  dif ${fmt(r.difference)}${r.late ? " (tardía)" : ""}${r.qrAlert ? " ¿QR?" : ""}`,
      );
    }
  }
  process.exit(0);
}
main();
