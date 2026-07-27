// Cruce 2: consignaciones Linux (a MI cuenta) vs extracto real del banco.
// Agrupa las filas de consignación por (fecha consig, nro doc) — un depósito
// físico puede cubrir varios días de venta — y busca en el banco un RECAUDO
// EFECTIVO del mismo día y monto (±$500). De paso vota referencia -> tienda.
import * as XLSX from "xlsx";
import { parseBanco } from "../src/lib/parsers/banco";

const DIR = "C:/Users/Paola Agreda/OneDrive/Escritorio/PROYECTOS PAO/muestras-conciliacion";
const MI_CUENTA = "100300399792";

function iso(n: number): string {
  return new Date(Date.UTC(1899, 11, 30) + n * 86400000).toISOString().slice(0, 10);
}
const fmt = (n: number) => "$" + Math.round(n).toLocaleString("es-CO");

// banco: hoja ALIANZA EFECTIVO de conciliacion.xlsx (2026-04-07 -> 06-30)
const src = XLSX.readFile("C:/Users/Paola Agreda/OneDrive/Escritorio/conciliacion.xlsx");
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, src.Sheets["ALIANZA EFECTIVO"], "Movimientos");
const bancoBuf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
const banco = parseBanco(bancoBuf);
const bankEntries = banco.entries
  .filter((e) => e.kind === "RECAUDO_EFECTIVO")
  .map((e) => ({ ...e, used: false }));
console.log(`Banco: ${bankEntries.length} recaudos efectivo, ${banco.entries[0]?.date ?? "?"} -> ...`);

// consignaciones Linux a mi cuenta
const wbC = XLSX.readFile(`${DIR}/sistemas anteriores/consignaciones linux.xlsx`);
const rowsC: any[][] = XLSX.utils.sheet_to_json(wbC.Sheets["consign"], { header: 1, raw: true });
interface G { suc: string; name: string; fecConsig: string; doc: string; total: number; dias: string[] }
const groups = new Map<string, G>();
for (const r of rowsC.slice(1)) {
  if (r[0] == null || r[2] == null) continue;
  if (String(r[6]) !== MI_CUENTA) continue;
  const key = `${r[0]}|${iso(r[3])}|${r[5]}`;
  const g = groups.get(key) ?? { suc: String(r[0]).toUpperCase(), name: String(r[1]), fecConsig: iso(r[3]), doc: String(r[5]), total: 0, dias: [] };
  g.total += Number(r[4] ?? 0);
  g.dias.push(iso(r[2]));
  groups.set(key, g);
}
console.log(`Consignaciones a mi cuenta: ${groups.size} depósitos físicos\n`);

const refVotes = new Map<string, Map<string, number>>(); // suc -> ref -> votos
let ok = 0, miss = 0;
const missing: G[] = [];
for (const g of [...groups.values()].sort((a, b) => a.fecConsig.localeCompare(b.fecConsig))) {
  // buscar en banco mismo día y monto (o día siguiente, por corte de proceso)
  const hit = bankEntries.find(
    (e) => !e.used && Math.abs(e.amount - g.total) <= 500 &&
      (e.date === g.fecConsig || e.date > g.fecConsig && e.date <= addDays(g.fecConsig, 2)),
  );
  if (hit) {
    hit.used = true;
    ok++;
    const ref = hit.reference ?? "?";
    if (!refVotes.has(g.suc)) refVotes.set(g.suc, new Map());
    const m = refVotes.get(g.suc)!;
    m.set(ref, (m.get(ref) ?? 0) + 1);
  } else {
    miss++;
    missing.push(g);
  }
}
function addDays(isoDate: string, days: number): string {
  const d = new Date(isoDate + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

console.log(`Encontrados en banco: ${ok} | NO encontrados: ${miss}\n`);
console.log("═══ REFERENCIA BANCARIA POR TIENDA (votos por calce fecha+monto) ═══");
for (const [suc, votes] of [...refVotes.entries()].sort()) {
  const list = [...votes.entries()].sort((a, b) => b[1] - a[1]).map(([r, n]) => `${r}(${n}x)`).join(", ");
  console.log(`  ${suc}: ${list}`);
}

console.log("\n═══ CONSIGNACIONES REPORTADAS QUE NO APARECEN EN EL BANCO ═══");
for (const g of missing) {
  console.log(`  ${g.suc} ${g.name} | consig ${g.fecConsig} doc ${g.doc} | ${fmt(g.total)} | ventas: ${g.dias.join(",")}`);
}
