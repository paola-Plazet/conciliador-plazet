// VERIFICACIÓN ABRIL, día por día y tienda por tienda:
//   EFE vendido (Linux) vs EFE consignado (por fecha de venta, cualquier cuenta)
//   TAR vendido (Linux) vs Plink (lo demás se asume datafono NL; se marca si Plink > TAR)
// Solo se listan los días que NO encajan (dif > $500).
import fs from "node:fs";
import * as XLSX from "xlsx";
import { parseDatafono } from "../src/lib/parsers/datafono";

const PP = "C:/Users/Paola Agreda/OneDrive/Escritorio/PROYECTOS PAO";
const DIR = `${PP}/muestras-conciliacion/sistemas anteriores`;
const NOMBRE: Record<string, string> = {
  BQ: "Unicentro Norte", Q9: "Unioccidente", BD: "Plaza de las Américas", D0: "Jardín Plaza",
  BB: "Éxito Occidente", BC: "Viva Envigado", BF: "Éxito Sabana", BJ: "Éxito San Pedro", BM: "Unicentro Cali",
};
const SUC2PLINK: Record<string, string> = { BD: "B1", Q9: "B2", BQ: "B3", D0: "JP" };
const DATAF_PROPIO: Record<string, string> = { BQ: "2026-04-23", Q9: "2026-04-24", BD: "2026-04-24", D0: "2026-05-16" };

const fmt = (n: number) => "$" + Math.round(n).toLocaleString("es-CO");
const toDate = (v: any): string =>
  typeof v === "number"
    ? new Date(Date.UTC(1899, 11, 30) + v * 86400000).toISOString().slice(0, 10)
    : String(v ?? "").trim();
const INI = "2026-04-01", FIN = "2026-04-30";

const ventas: any[] = XLSX.utils.sheet_to_json(XLSX.readFile(`${DIR}/ventaSabmyju.xlsx`).Sheets["ventaSabmyju"]);
const efe = new Map<string, number>(), tar = new Map<string, number>();
for (const r of ventas) {
  const suc = String(r.SUC ?? "").trim();
  const d = toDate(r.FECHA);
  if (!suc || d < INI || d > FIN) continue;
  const e = Number(r.EFE ?? 0), t = Number(r.TAR ?? 0);
  if (e) efe.set(`${suc}|${d}`, (efe.get(`${suc}|${d}`) ?? 0) + e);
  if (t) tar.set(`${suc}|${d}`, (tar.get(`${suc}|${d}`) ?? 0) + t);
}

const consigs: any[] = XLSX.utils.sheet_to_json(XLSX.readFile(`${DIR}/consignaciones linux.xlsx`).Sheets["consign"]);
const consDia = new Map<string, number>();
for (const r of consigs) {
  const keys = Object.keys(r);
  const get = (pat: RegExp) => { const k = keys.find((k) => pat.test(k)); return k ? r[k] : undefined; };
  const suc = String(get(/^SU$/i) ?? "").trim();
  const fecVenta = toDate(get(/VENTA/i));
  const vlr = Number(get(/VLR/i) ?? 0);
  if (!suc || !vlr || fecVenta < INI || fecVenta > FIN) continue;
  consDia.set(`${suc}|${fecVenta}`, (consDia.get(`${suc}|${fecVenta}`) ?? 0) + vlr);
}

const plink = new Map<string, number>();
{
  const out = parseDatafono(fs.readFileSync(`${PP}/muestras-conciliacion/901987494_Reporte_Conciliar_20260401_20260430.xlsx`));
  for (const e of out.entries)
    if (e.storeCode) plink.set(`${e.storeCode}|${e.txDate}`, (plink.get(`${e.storeCode}|${e.txDate}`) ?? 0) + e.gross);
}

const TOL = 500;
let okDias = 0, malDias = 0;
for (const suc of Object.keys(NOMBRE)) {
  const dias = new Set<string>();
  for (const k of [...efe.keys(), ...tar.keys(), ...consDia.keys()]) {
    const [s, d] = k.split("|");
    if (s === suc) dias.add(d);
  }
  if (!dias.size) continue;
  const problemas: string[] = [];
  let vEfe = 0, vCons = 0, vTar = 0, vPlink = 0;
  for (const d of [...dias].sort()) {
    const e = efe.get(`${suc}|${d}`) ?? 0;
    const c = consDia.get(`${suc}|${d}`) ?? 0;
    const t = tar.get(`${suc}|${d}`) ?? 0;
    const pk = SUC2PLINK[suc];
    const p = pk ? (plink.get(`${pk}|${d}`) ?? 0) : 0;
    vEfe += e; vCons += c; vTar += t; vPlink += p;
    const difE = e - c;
    if (Math.abs(difE) > TOL) {
      problemas.push(`   ${d}  EFE vendido ${fmt(e).padStart(11)}  consignado ${fmt(c).padStart(11)}  dif ${fmt(difE).padStart(11)}`);
    }
    // TAR: si ya tenía datafono propio, lo esperado es Plink ≈ TAR (o menos por mixto);
    // se marca si Plink supera la venta (anomalía) — el resto es datafono NL.
    if (p - t > TOL) problemas.push(`   ${d}  ⚠ Plink ${fmt(p)} > venta TAR ${fmt(t)} (dif ${fmt(p - t)})`);
    if (Math.abs(difE) <= TOL) okDias++; else malDias++;
  }
  console.log(`\n${NOMBRE[suc]} (${suc}) — EFE vendido ${fmt(vEfe)} | consignado ${fmt(vCons)} | dif ${fmt(vEfe - vCons)}`);
  console.log(`   TAR vendido ${fmt(vTar)} | Plink ${fmt(vPlink)} | datafono NL ${fmt(vTar - Math.min(vPlink, vTar))}${DATAF_PROPIO[suc] ? ` (datafono propio desde ${DATAF_PROPIO[suc].slice(5)})` : ""}`);
  if (problemas.length) {
    console.log(`   DÍAS QUE NO ENCAJAN (${problemas.length}):`);
    for (const p of problemas) console.log(p);
  } else console.log("   ✔ todos los días encajan (±$500)");
}
console.log(`\nResumen: ${okDias} días cuadran, ${malDias} días con diferencia.`);
