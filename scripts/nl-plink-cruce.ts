// Cruce día a día: ventas TAR de Linux vs recaudo del datafono propio (Plink)
// en la ventana [corte, fin de Linux] de cada tienda de Paola.
// Lo que Plink NO cubrió de la venta TAR fue recaudado por el datafono de NL
// → eso es lo que NL le debe (B ajustado).
// Los archivos Plink se solapan: se agrega por (tienda, día) por archivo y se
// toma el máximo entre archivos (deben coincidir cuando ambos cubren el día).
import fs from "node:fs";
import * as XLSX from "xlsx";
import { parseDatafono } from "../src/lib/parsers/datafono";

const MC = "C:/Users/Paola Agreda/OneDrive/Escritorio/PROYECTOS PAO/muestras-conciliacion";
const FILES = [
  `${MC}/901987494_Reporte_Conciliar_20260401_20260430.xlsx`,
  `${MC}/901987494_Reporte_Conciliar_20260501_20260531.xlsx`,
];

// tienda Linux (SUC) → código de tienda del datafono
const SUC2STORE: Record<string, string> = { BD: "B1", Q9: "B2", BQ: "B3", D0: "JP" };
const VENTANA: Record<string, [string, string]> = {
  BQ: ["2026-04-16", "2026-04-29"],
  Q9: ["2026-04-16", "2026-05-04"],
  BD: ["2026-04-16", "2026-05-05"],
  D0: ["2026-05-16", "2026-05-27"],
};
const NOMBRE: Record<string, string> = {
  BQ: "Unicentro Norte",
  Q9: "Unioccidente",
  BD: "Plaza de las Américas",
  D0: "Jardín Plaza",
};
const fmt = (n: number) => "$" + Math.round(n).toLocaleString("es-CO");
const toDate = (v: any): string =>
  typeof v === "number"
    ? new Date(Date.UTC(1899, 11, 30) + v * 86400000).toISOString().slice(0, 10)
    : String(v ?? "").trim();

// ── Plink: bruto por (storeCode, txDate), máximo entre archivos ──────────
const plink = new Map<string, number>(); // `${store}|${date}` -> gross
for (const f of FILES) {
  const out = parseDatafono(fs.readFileSync(f));
  const perFile = new Map<string, number>();
  for (const e of out.entries) {
    if (!e.storeCode) continue;
    const k = `${e.storeCode}|${e.txDate}`;
    perFile.set(k, (perFile.get(k) ?? 0) + e.gross);
  }
  for (const [k, v] of perFile) {
    const prev = plink.get(k);
    if (prev != null && Math.abs(prev - v) > 500)
      console.log(`   ⚠ ${k}: archivos difieren ${fmt(prev)} vs ${fmt(v)} (tomo el mayor)`);
    plink.set(k, Math.max(prev ?? 0, v));
  }
}

// ── Ventas TAR Linux por (SUC, día) ──────────────────────────────────────
const vWb = XLSX.readFile(
  "C:/Users/Paola Agreda/OneDrive/Escritorio/PROYECTOS PAO/muestras-conciliacion/sistemas anteriores/ventaSabmyju.xlsx",
);
const ventas: any[] = XLSX.utils.sheet_to_json(vWb.Sheets["ventaSabmyju"]);
const tar = new Map<string, number>(); // `${suc}|${date}` -> TAR
for (const r of ventas) {
  const suc = String(r.SUC ?? "").trim();
  const d = toDate(r.FECHA);
  const v = Number(r.TAR ?? 0);
  if (!suc || !d || !v) continue;
  const k = `${suc}|${d}`;
  tar.set(k, (tar.get(k) ?? 0) + v);
}

// ── Cruce por tienda/día en la ventana ───────────────────────────────────
let totalNL = 0;
let totalPlinkEnVentana = 0;
for (const suc of Object.keys(VENTANA)) {
  const [ini, fin] = VENTANA[suc];
  const store = SUC2STORE[suc];
  console.log(`\n${NOMBRE[suc]} (${suc} → datafono ${store})  ventana ${ini} → ${fin}`);
  console.log("   día          TAR Linux      Plink propio    NL recaudó (dif)");
  let subNL = 0;
  const days: string[] = [];
  for (let d = new Date(ini + "T00:00:00Z"); toDate(d as any) <= fin || d.toISOString().slice(0, 10) <= fin; d.setUTCDate(d.getUTCDate() + 1)) {
    const ds = d.toISOString().slice(0, 10);
    if (ds > fin) break;
    days.push(ds);
  }
  for (const ds of days) {
    const t = tar.get(`${suc}|${ds}`) ?? 0;
    const p = plink.get(`${store}|${ds}`) ?? 0;
    if (!t && !p) continue;
    const nl = Math.max(0, t - p);
    subNL += nl;
    totalPlinkEnVentana += Math.min(p, t);
    const marca = p === 0 ? "← sin datafono propio" : p + 500 < t ? "← mixto" : t + 500 < p ? "⚠ Plink > TAR" : "✔ todo directo";
    console.log(
      `   ${ds}  ${fmt(t).padStart(13)}  ${fmt(p).padStart(13)}  ${fmt(nl).padStart(13)}  ${marca}`,
    );
  }
  console.log(`   SUBTOTAL NL recaudó de ${NOMBRE[suc]}: ${fmt(subNL)}`);
  totalNL += subNL;
}

console.log(`\n>>> B AJUSTADO (tarjetas post-corte que SÍ recaudó NL) = ${fmt(totalNL)}`);
console.log(`    (de la venta TAR post-corte, ya entró directo por Plink ≈ ${fmt(totalPlinkEnVentana)})`);

const A = 29024187;
const R = 22000000 + 10976384; // solo devoluciones de tarjetas confirmadas por Paola
console.log(`\nSALDO NETO ACTUALIZADO:`);
console.log(`   B  NL debe (tarjetas que recaudó NL)      ${fmt(totalNL).padStart(16)}`);
console.log(`   A  Paola debe (efectivo pre-corte+cerradas) ${fmt(-A).padStart(14)}`);
console.log(`   R  Ya devuelto por NL (22M + 10.976.384)  ${fmt(-R).padStart(16)}`);
const neto = totalNL - A - R;
console.log(`   ${"─".repeat(58)}`);
if (neto >= 0) console.log(`   >>> NATURAL LIGHT LE DEBE A PAOLA: ${fmt(neto)}`);
else console.log(`   >>> PAOLA LE DEBE A NATURAL LIGHT: ${fmt(-neto)}`);
