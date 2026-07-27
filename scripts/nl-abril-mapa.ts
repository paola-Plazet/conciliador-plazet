// MAPA DE ABRIL (ventas Linux 1→30 abr, por tienda):
//   venta total NET = EFE + TAR
//   EFE → según consignaciones (por FEC.VENTA): cuenta NL (100300221336),
//         cuenta Habbie/Paola (100300399792), cuenta propia Éxito Occ (2600124347),
//         y lo que no aparece consignado en el archivo.
//   TAR → datafono Habbie (Plink, por día) y el resto al datafono de NL.
import fs from "node:fs";
import * as XLSX from "xlsx";
import { parseDatafono } from "../src/lib/parsers/datafono";

const DIR =
  "C:/Users/Paola Agreda/OneDrive/Escritorio/PROYECTOS PAO/muestras-conciliacion/sistemas anteriores";
const CTA_HABBIE = "100300399792";
const CTA_NL = "100300221336";
const CTA_BB = "2600124347";

const NOMBRE: Record<string, string> = {
  BQ: "Unicentro Norte",
  Q9: "Unioccidente",
  BD: "Plaza de las Américas",
  D0: "Jardín Plaza",
  BB: "Éxito Occidente",
  BC: "Viva Envigado",
  BF: "Éxito Sabana",
  BJ: "Éxito San Pedro",
  BM: "Unicentro Cali",
};
const SUC2PLINK: Record<string, string> = { BD: "B1", Q9: "B2", BQ: "B3", D0: "JP" };

const fmt = (n: number) => Math.round(n).toLocaleString("es-CO");
const toDate = (v: any): string =>
  typeof v === "number"
    ? new Date(Date.UTC(1899, 11, 30) + v * 86400000).toISOString().slice(0, 10)
    : String(v ?? "").trim();
const INI = process.argv[2] ?? "2026-04-01";
const FIN = process.argv[3] ?? "2026-04-30";

// ── Ventas Linux abril ───────────────────────────────────────────────────
const vWb = XLSX.readFile(`${DIR}/ventaSabmyju.xlsx`);
const ventas: any[] = XLSX.utils.sheet_to_json(vWb.Sheets["ventaSabmyju"]);
const efe = new Map<string, Map<string, number>>();
const tarD = new Map<string, Map<string, number>>();
const net = new Map<string, number>();
for (const r of ventas) {
  const suc = String(r.SUC ?? "").trim();
  const d = toDate(r.FECHA);
  if (!suc || d < INI || d > FIN) continue;
  net.set(suc, (net.get(suc) ?? 0) + Number(r.NET ?? 0));
  for (const [col, map] of [["EFE", efe], ["TAR", tarD]] as const) {
    const v = Number(r[col] ?? 0);
    if (!v) continue;
    const m = map.get(suc) ?? new Map();
    m.set(d, (m.get(d) ?? 0) + v);
    map.set(suc, m);
  }
}

// ── Consignaciones por FEC.VENTA de abril ────────────────────────────────
const cWb = XLSX.readFile(`${DIR}/consignaciones linux.xlsx`);
const consigs: any[] = XLSX.utils.sheet_to_json(cWb.Sheets["consign"]);
const consByStore = new Map<string, { habbie: number; nl: number; bb: number; otra: number }>();
for (const r of consigs) {
  const keys = Object.keys(r);
  const get = (pat: RegExp) => {
    const k = keys.find((k) => pat.test(k));
    return k ? r[k] : undefined;
  };
  const suc = String(get(/^SU$/i) ?? "").trim();
  const fecVenta = toDate(get(/VENTA/i));
  const vlr = Number(get(/VLR/i) ?? 0);
  const cuenta = String(get(/CUENTA/i) ?? "").trim();
  if (!suc || !vlr || fecVenta < INI || fecVenta > FIN) continue;
  const s = consByStore.get(suc) ?? { habbie: 0, nl: 0, bb: 0, otra: 0 };
  if (cuenta === CTA_HABBIE) s.habbie += vlr;
  else if (cuenta === CTA_NL) s.nl += vlr;
  else if (cuenta === CTA_BB) s.bb += vlr;
  else s.otra += vlr;
  consByStore.set(suc, s);
}

// ── Plink por (tienda, día) — máx entre archivos solapados ───────────────
const PLINK_FILES = [
  `${"C:/Users/Paola Agreda/OneDrive/Escritorio/PROYECTOS PAO/muestras-conciliacion"}/901987494_Reporte_Conciliar_20260401_20260430.xlsx`,
  `${"C:/Users/Paola Agreda/OneDrive/Escritorio/PROYECTOS PAO/muestras-conciliacion"}/901987494_Reporte_Conciliar_20260501_20260531.xlsx`,
];
const plink = new Map<string, number>();
for (const f of PLINK_FILES) {
  const out = parseDatafono(fs.readFileSync(f));
  const perFile = new Map<string, number>();
  for (const e of out.entries) {
    if (!e.storeCode || e.txDate < INI || e.txDate > FIN) continue;
    const k = `${e.storeCode}|${e.txDate}`;
    perFile.set(k, (perFile.get(k) ?? 0) + e.gross);
  }
  for (const [k, v] of perFile) plink.set(k, Math.max(plink.get(k) ?? 0, v));
}

// ── Tabla por tienda ─────────────────────────────────────────────────────
const orden = ["BQ", "Q9", "BD", "D0", "BB", "BC", "BF", "BJ", "BM"];
const tot = { net: 0, efe: 0, tar: 0, efeH: 0, efeNL: 0, efeBB: 0, efeSin: 0, tarH: 0, tarNL: 0 };

console.log(`VENTAS LINUX ${INI} → ${FIN} — A DÓNDE ENTRÓ CADA PESO, POR TIENDA`);
for (const suc of orden) {
  const n = net.get(suc) ?? 0;
  if (!n) continue;
  const efeSum = [...(efe.get(suc) ?? new Map()).values()].reduce((s: number, v: number) => s + v, 0);
  const tarSum = [...(tarD.get(suc) ?? new Map()).values()].reduce((s: number, v: number) => s + v, 0);

  // TAR: por día, lo que cubrió Plink es de Habbie; el resto, datafono NL
  let tarH = 0;
  const pk = SUC2PLINK[suc];
  for (const [d, t] of tarD.get(suc) ?? new Map()) {
    const p = pk ? (plink.get(`${pk}|${d}`) ?? 0) : 0;
    tarH += Math.min(t, p);
  }
  const tarNL = tarSum - tarH;

  const c = consByStore.get(suc) ?? { habbie: 0, nl: 0, bb: 0, otra: 0 };
  const efeSin = efeSum - c.habbie - c.nl - c.bb - c.otra;

  console.log(`\n${NOMBRE[suc]} (${suc})`);
  console.log(`   Venta total NET:            $${fmt(n).padStart(13)}  (EFE $${fmt(efeSum)} + TAR $${fmt(tarSum)})`);
  console.log(`   EFECTIVO → cuenta NL:       $${fmt(c.nl).padStart(13)}`);
  console.log(`   EFECTIVO → cuenta HABBIE:   $${fmt(c.habbie).padStart(13)}`);
  if (c.bb) console.log(`   EFECTIVO → cuenta propia BB:$${fmt(c.bb).padStart(13)}  (luego devuelta a Habbie)`);
  if (c.otra) console.log(`   EFECTIVO → otra cuenta:     $${fmt(c.otra).padStart(13)}`);
  console.log(`   EFECTIVO sin registro consig:$${fmt(efeSin).padStart(12)}`);
  console.log(`   TARJETAS → datafono NL:     $${fmt(tarNL).padStart(13)}`);
  console.log(`   TARJETAS → datafono HABBIE: $${fmt(tarH).padStart(13)}`);

  tot.net += n; tot.efe += efeSum; tot.tar += tarSum;
  tot.efeH += c.habbie; tot.efeNL += c.nl; tot.efeBB += c.bb; tot.efeSin += efeSin;
  tot.tarH += tarH; tot.tarNL += tarNL;
}

console.log(`\n${"═".repeat(66)}`);
console.log("TOTAL ABRIL TODAS LAS TIENDAS");
console.log(`   Venta total NET:            $${fmt(tot.net).padStart(13)}  (EFE $${fmt(tot.efe)} + TAR $${fmt(tot.tar)})`);
console.log(`   EFECTIVO → cuenta NL:       $${fmt(tot.efeNL).padStart(13)}`);
console.log(`   EFECTIVO → cuenta HABBIE:   $${fmt(tot.efeH).padStart(13)}`);
console.log(`   EFECTIVO → cuenta propia BB:$${fmt(tot.efeBB).padStart(13)}`);
console.log(`   EFECTIVO sin registro:      $${fmt(tot.efeSin).padStart(13)}`);
console.log(`   TARJETAS → datafono NL:     $${fmt(tot.tarNL).padStart(13)}`);
console.log(`   TARJETAS → datafono HABBIE: $${fmt(tot.tarH).padStart(13)}`);
