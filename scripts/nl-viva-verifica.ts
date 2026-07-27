// Verifica Viva Envigado (BC): sus consignaciones a la cuenta de Habbie vs
// los movimientos "APORTE : BANCOLOMBIA" del extracto (que NO tienen
// referencia de recaudo y por eso el cruce por referencia no los vio).
import * as XLSX from "xlsx";

const fmt = (n: number) => "$" + Math.round(n).toLocaleString("es-CO");
const toDate = (v: any): string =>
  typeof v === "number"
    ? new Date(Date.UTC(1899, 11, 30) + v * 86400000).toISOString().slice(0, 10)
    : String(v ?? "").trim();

// Consignaciones BC a cuenta Habbie
const consigs: any[] = XLSX.utils.sheet_to_json(
  XLSX.readFile(
    "C:/Users/Paola Agreda/OneDrive/Escritorio/PROYECTOS PAO/muestras-conciliacion/sistemas anteriores/consignaciones linux.xlsx",
  ).Sheets["consign"],
);
console.log("Consignaciones de VIVA ENVIGADO según archivo Linux (todas las cuentas):");
const bc = consigs
  .map((r) => {
    const keys = Object.keys(r);
    const get = (pat: RegExp) => { const k = keys.find((k) => pat.test(k)); return k ? r[k] : undefined; };
    return {
      suc: String(get(/^SU$/i) ?? "").trim(),
      fecVenta: toDate(get(/VENTA/i)),
      fecConsig: toDate(get(/CONSIG/i)),
      vlr: Number(get(/VLR/i) ?? 0),
      cuenta: String(get(/CUENTA/i) ?? "").trim(),
      doc: String(get(/DOC/i) ?? "").trim(),
    };
  })
  .filter((c) => c.suc === "BC")
  .sort((a, b) => a.fecVenta.localeCompare(b.fecVenta));
let sumH = 0;
for (const c of bc) {
  const esHabbie = c.cuenta === "100300399792";
  if (esHabbie) sumH += c.vlr;
  console.log(
    `   venta ${c.fecVenta}  consig ${c.fecConsig}  ${fmt(c.vlr).padStart(11)}  cta ${c.cuenta} ${esHabbie ? "(HABBIE)" : "(NL)"}  doc ${c.doc}`,
  );
}
console.log(`   Total a cuenta HABBIE: ${fmt(sumH)}`);

// Movimientos APORTE del banco
const bRows: any[] = XLSX.utils.sheet_to_json(
  XLSX.readFile("C:/Users/Paola Agreda/OneDrive/Escritorio/conciliacion.xlsx").Sheets["ALIANZA EFECTIVO"],
);
console.log("\nMovimientos 'APORTE' en el extracto (sin referencia de recaudo):");
const aportes = bRows
  .map((r) => ({ date: toDate(r["Fecha Tran"]), concepto: String(r["Concepto"] ?? ""), valor: Number(r["Valor"] ?? 0) }))
  .filter((b) => /^APORTE/i.test(b.concepto.trim()) && b.valor > 0)
  .sort((a, b) => a.date.localeCompare(b.date));
let sumA = 0;
for (const a of aportes) {
  sumA += a.valor;
  console.log(`   ${a.date}  ${fmt(a.valor).padStart(11)}  ${a.concepto.slice(0, 70)}`);
}
console.log(`   Total APORTES: ${fmt(sumA)}`);

// Cruce por valor exacto
console.log("\nCalce consignación BC (Habbie) ↔ aporte banco (por valor, ±$500):");
const usados = new Set<number>();
for (const c of bc.filter((c) => c.cuenta === "100300399792")) {
  const i = aportes.findIndex((a, idx) => !usados.has(idx) && Math.abs(a.valor - c.vlr) <= 500);
  if (i >= 0) {
    usados.add(i);
    console.log(`   ✔ venta ${c.fecVenta} ${fmt(c.vlr).padStart(11)} ↔ banco ${aportes[i].date} ${fmt(aportes[i].valor)}`);
  } else {
    console.log(`   ✘ venta ${c.fecVenta} ${fmt(c.vlr).padStart(11)} — SIN calce en aportes`);
  }
}
const sinUsar = aportes.filter((_, i) => !usados.has(i));
if (sinUsar.length)
  console.log(`   Aportes del banco sin consignación BC: ${sinUsar.map((a) => `${a.date} ${fmt(a.valor)}`).join(", ")}`);
