// Refinamiento del cruce 2: para los depósitos no hallados, probar la suma
// de todos los docs de la misma tienda y día de consignación (un solo
// depósito físico), y ampliar la ventana de búsqueda a +4 días.
import * as XLSX from "xlsx";
import { parseBanco } from "../src/lib/parsers/banco";

const DIR = "C:/Users/Paola Agreda/OneDrive/Escritorio/PROYECTOS PAO/muestras-conciliacion";
const MI_CUENTA = "100300399792";
function iso(n: number): string {
  return new Date(Date.UTC(1899, 11, 30) + n * 86400000).toISOString().slice(0, 10);
}
function addDays(d: string, n: number): string {
  const x = new Date(d + "T00:00:00Z"); x.setUTCDate(x.getUTCDate() + n);
  return x.toISOString().slice(0, 10);
}
const fmt = (n: number) => "$" + Math.round(n).toLocaleString("es-CO");

const src = XLSX.readFile("C:/Users/Paola Agreda/OneDrive/Escritorio/conciliacion.xlsx");
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, src.Sheets["ALIANZA EFECTIVO"], "Movimientos");
const banco = parseBanco(XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer);
const bankEntries = banco.entries.filter((e) => e.kind === "RECAUDO_EFECTIVO").map((e) => ({ ...e, used: false }));

const wbC = XLSX.readFile(`${DIR}/sistemas anteriores/consignaciones linux.xlsx`);
const rowsC: any[][] = XLSX.utils.sheet_to_json(wbC.Sheets["consign"], { header: 1, raw: true });

// nivel 1: grupos por (suc, fecConsig, doc); nivel 2: por (suc, fecConsig)
interface G { suc: string; name: string; fecConsig: string; docs: Set<string>; total: number; dias: string[] }
const byDay = new Map<string, G>();
for (const r of rowsC.slice(1)) {
  if (r[0] == null || r[2] == null) continue;
  if (String(r[6]) !== MI_CUENTA) continue;
  const key = `${r[0]}|${iso(r[3])}`;
  const g = byDay.get(key) ?? { suc: String(r[0]).toUpperCase(), name: String(r[1]), fecConsig: iso(r[3]), docs: new Set(), total: 0, dias: [] };
  g.total += Number(r[4] ?? 0);
  g.docs.add(String(r[5]));
  g.dias.push(iso(r[2]));
  byDay.set(key, g);
}

// también por doc individual (para tiendas que sí consignan doc por doc)
const byDoc = new Map<string, G>();
for (const r of rowsC.slice(1)) {
  if (r[0] == null || r[2] == null) continue;
  if (String(r[6]) !== MI_CUENTA) continue;
  const key = `${r[0]}|${iso(r[3])}|${r[5]}`;
  const g = byDoc.get(key) ?? { suc: String(r[0]).toUpperCase(), name: String(r[1]), fecConsig: iso(r[3]), docs: new Set([String(r[5])]), total: 0, dias: [] };
  g.total += Number(r[4] ?? 0);
  g.dias.push(iso(r[2]));
  byDoc.set(key, g);
}

const refVotes = new Map<string, Map<string, number>>();
const vote = (suc: string, ref: string) => {
  if (!refVotes.has(suc)) refVotes.set(suc, new Map());
  const m = refVotes.get(suc)!;
  m.set(ref, (m.get(ref) ?? 0) + 1);
};

// estrategia: primero calzar depósitos por DOC exacto; lo que no calce,
// intentar por total del día; ventana [mismo día .. +4 días]
function findBank(amount: number, from: string): (typeof bankEntries)[number] | undefined {
  return bankEntries.find(
    (e) => !e.used && Math.abs(e.amount - amount) <= 500 && e.date >= from && e.date <= addDays(from, 4),
  );
}

const matchedDayKeys = new Set<string>();
const results: { g: G; status: string; ref?: string; bankDate?: string }[] = [];

// pase 1: por doc
for (const g of [...byDoc.values()].sort((a, b) => a.fecConsig.localeCompare(b.fecConsig))) {
  const hit = findBank(g.total, g.fecConsig);
  if (hit) {
    hit.used = true;
    matchedDayKeys.add(`${g.suc}|${g.fecConsig}`);
    results.push({ g, status: "OK(doc)", ref: hit.reference ?? "?", bankDate: hit.date });
    vote(g.suc, hit.reference ?? "?");
  } else {
    results.push({ g, status: "PEND" });
  }
}
// pase 2: días completos aún sin calce total
const pendByDay = new Map<string, G>();
for (const r of results.filter((x) => x.status === "PEND")) {
  const key = `${r.g.suc}|${r.g.fecConsig}`;
  const g = pendByDay.get(key) ?? { ...r.g, docs: new Set<string>(), total: 0, dias: [] };
  g.total += r.g.total;
  r.g.docs.forEach((d) => g.docs.add(d));
  g.dias.push(...r.g.dias);
  pendByDay.set(key, g);
}
const finalMissing: G[] = [];
for (const [key, g] of pendByDay) {
  if (g.docs.size > 1 || !matchedDayKeys.has(key)) {
    const hit = findBank(g.total, g.fecConsig);
    if (hit) {
      hit.used = true;
      results.push({ g, status: "OK(día combinado)", ref: hit.reference ?? "?", bankDate: hit.date });
      vote(g.suc, hit.reference ?? "?");
      // quitar los PEND cubiertos
      for (const r of results) if (r.status === "PEND" && `${r.g.suc}|${r.g.fecConsig}` === key) r.status = "cubierto";
      continue;
    }
  }
  finalMissing.push(g);
}

const okDoc = results.filter((r) => r.status === "OK(doc)").length;
const okDay = results.filter((r) => r.status === "OK(día combinado)").length;
console.log(`Calce por doc: ${okDoc} | calce por día combinado: ${okDay} | sin hallar: ${finalMissing.length}\n`);

console.log("═══ VOTOS REFERENCIA -> TIENDA (refinado) ═══");
for (const [suc, votes] of [...refVotes.entries()].sort()) {
  const list = [...votes.entries()].sort((a, b) => b[1] - a[1]).map(([r, n]) => `${r}(${n}x)`).join(", ");
  console.log(`  ${suc}: ${list}`);
}

console.log("\n═══ DEFINITIVAMENTE NO HALLADOS EN EL BANCO ═══");
let totMiss = 0;
for (const g of finalMissing.sort((a, b) => a.fecConsig.localeCompare(b.fecConsig))) {
  totMiss += g.total;
  console.log(`  ${g.suc} ${g.name} | consig ${g.fecConsig} | ${fmt(g.total)} | ventas ${g.dias.sort().join(",")}`);
}
console.log(`  TOTAL: ${fmt(totMiss)}`);

// referencias del banco no consumidas en abril (para contexto)
console.log("\n═══ RECAUDOS DEL BANCO EN ABRIL QUE NADIE RECLAMÓ (no usados en el calce) ═══");
for (const e of bankEntries.filter((e) => !e.used && e.date <= "2026-05-05")) {
  console.log(`  ${e.date} ref ${e.reference} ${fmt(e.amount)}`);
}
