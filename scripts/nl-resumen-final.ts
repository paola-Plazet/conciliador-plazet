// RESUMEN GENERAL POR TIENDA — toda la época Linux (abril + mayo 2026).
// Por tienda: venta total, destino del efectivo (cuenta NL / cuenta Habbie /
// cuenta propia BB / sin registro) y de las tarjetas (datafono NL / Plink
// Habbie), y su aporte al cruce con Natural Light.
// Genera Excel: PROYECTOS PAO/Resumen cruce Natural Light.xlsx
import fs from "node:fs";
import * as XLSX from "xlsx";
import { parseDatafono } from "../src/lib/parsers/datafono";

const PP = "C:/Users/Paola Agreda/OneDrive/Escritorio/PROYECTOS PAO";
const DIR = `${PP}/muestras-conciliacion/sistemas anteriores`;
const MC = `${PP}/muestras-conciliacion`;
const CTA_HABBIE = "100300399792";
const CTA_NL = "100300221336";
const CTA_BB = "2600124347";

const CORTE: Record<string, string> = {
  BQ: "2026-04-16",
  Q9: "2026-04-16",
  BD: "2026-04-16",
  D0: "2026-05-16",
};
const CERRADAS = new Set(["BB", "BC", "BF", "BJ", "BM"]);
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
// EFE de tiendas cerradas realmente recibido en banco (verificado nl-cruce-cuentas.ts)
const CERRADA_BANCO: Record<string, number> = {
  BJ: 3244150,
  BF: 2796600,
  BM: 448750 + 3812350,
  BB: 3842765, // devolución de su cuenta propia, 20-abr
  BC: 1010065, // ventas 6→16-abr, llegaron como APORTE Bancolombia (verificado al peso)
};

const toDate = (v: any): string =>
  typeof v === "number"
    ? new Date(Date.UTC(1899, 11, 30) + v * 86400000).toISOString().slice(0, 10)
    : String(v ?? "").trim();
const fmt = (n: number) => "$" + Math.round(n).toLocaleString("es-CO");

// ── Ventas Linux (todo el archivo) ───────────────────────────────────────
const vWb = XLSX.readFile(`${DIR}/ventaSabmyju.xlsx`);
const ventas: any[] = XLSX.utils.sheet_to_json(vWb.Sheets["ventaSabmyju"]);
interface St {
  net: number; efe: number; tar: number;
  efeDia: Map<string, number>; tarDia: Map<string, number>;
  ini: string; fin: string;
}
const st = new Map<string, St>();
for (const r of ventas) {
  const suc = String(r.SUC ?? "").trim();
  const d = toDate(r.FECHA);
  if (!suc || !d) continue;
  // Jardín Plaza solo cuenta desde el 16-may: lo anterior (unas devoluciones
  // de abril) es de la era Natural Light y no entra en el resumen.
  if (suc === "D0" && d < "2026-05-16") continue;
  const s = st.get(suc) ?? { net: 0, efe: 0, tar: 0, efeDia: new Map(), tarDia: new Map(), ini: d, fin: d };
  s.net += Number(r.NET ?? 0);
  const e = Number(r.EFE ?? 0), t = Number(r.TAR ?? 0);
  s.efe += e; s.tar += t;
  if (e) s.efeDia.set(d, (s.efeDia.get(d) ?? 0) + e);
  if (t) s.tarDia.set(d, (s.tarDia.get(d) ?? 0) + t);
  if (d < s.ini) s.ini = d;
  if (d > s.fin) s.fin = d;
  st.set(suc, s);
}

// Las ventas Alegra de la transición entraron a datafonos propios (incl. el
// terminal "Principal" 31014111 el 1-may) — no se le cobran a NL.
// Rappi may+jun (Alegra) pagado a Natural Light → entra al cruce a favor de Paola.
const RAPPI = 1265350 + 421800;

// ── Consignaciones por cuenta ────────────────────────────────────────────
const cWb = XLSX.readFile(`${DIR}/consignaciones linux.xlsx`);
const consigs: any[] = XLSX.utils.sheet_to_json(cWb.Sheets["consign"]);
const cons = new Map<string, { habbie: number; habbiePre: number; nl: number; bb: number }>();
for (const r of consigs) {
  const keys = Object.keys(r);
  const get = (pat: RegExp) => { const k = keys.find((k) => pat.test(k)); return k ? r[k] : undefined; };
  const suc = String(get(/^SU$/i) ?? "").trim();
  const fecVenta = toDate(get(/VENTA/i));
  const vlr = Number(get(/VLR/i) ?? 0);
  const cuenta = String(get(/CUENTA/i) ?? "").trim();
  if (!suc || !vlr) continue;
  const c = cons.get(suc) ?? { habbie: 0, habbiePre: 0, nl: 0, bb: 0 };
  if (cuenta === CTA_HABBIE) {
    c.habbie += vlr;
    if (CORTE[suc] && fecVenta < CORTE[suc]) c.habbiePre += vlr;
  } else if (cuenta === CTA_NL) c.nl += vlr;
  else if (cuenta === CTA_BB) c.bb += vlr;
  cons.set(suc, c);
}

// ── Plink por (tienda, día) ──────────────────────────────────────────────
const plink = new Map<string, number>();
for (const f of [
  `${MC}/901987494_Reporte_Conciliar_20260401_20260430.xlsx`,
  `${MC}/901987494_Reporte_Conciliar_20260501_20260531.xlsx`,
]) {
  const out = parseDatafono(fs.readFileSync(f));
  for (const e of out.entries) {
    if (!e.storeCode) continue;
    const k = `${e.storeCode}|${e.txDate}`;
    plink.set(k, (plink.get(k) ?? 0) + e.gross);
  }
}

// ── Armar filas ──────────────────────────────────────────────────────────
const orden = ["BQ", "Q9", "BD", "D0", "BB", "BC", "BF", "BJ", "BM"];
const rows: any[] = [];
let T = { net: 0, efe: 0, tar: 0, efeNL: 0, efeH: 0, efeBB: 0, efeSin: 0, tarNL: 0, tarH: 0, nlDebe: 0, paolaDebe: 0 };
for (const suc of orden) {
  const s = st.get(suc);
  if (!s) continue;
  const c = cons.get(suc) ?? { habbie: 0, habbiePre: 0, nl: 0, bb: 0 };
  const pk = SUC2PLINK[suc];
  let tarH = 0, tarNLpost = 0;
  for (const [d, t] of s.tarDia) {
    const p = pk ? Math.min(t, plink.get(`${pk}|${d}`) ?? 0) : 0;
    tarH += p;
    if (CORTE[suc] && d >= CORTE[suc]) tarNLpost += Math.max(0, t - p);
  }
  const tarNL = s.tar - tarH;
  const efeSin = s.efe - c.habbie - c.nl - c.bb;
  const esMia = !!CORTE[suc];
  const nlDebe = esMia ? tarNLpost : 0;
  const paolaDebe = esMia ? c.habbiePre : CERRADA_BANCO[suc] ?? 0;

  rows.push({
    Tienda: NOMBRE[suc],
    Código: suc,
    Situación: esMia ? `De Paola desde ${CORTE[suc].slice(5)}` : "Cerró (es de NL)",
    "Vendió (Linux)": `${s.ini.slice(5)} → ${s.fin.slice(5)}`,
    "Venta total": s.net,
    "Efectivo vendido": s.efe,
    "EFE → cuenta NL": c.nl,
    "EFE → cuenta Habbie": c.habbie,
    "EFE → cuenta propia": c.bb,
    "EFE sin registro": efeSin,
    "Tarjetas vendidas": s.tar,
    "TAR → datafono NL": tarNL,
    "TAR → datafono Habbie": tarH,
    "NL le debe a Paola (TAR post-corte)": nlDebe,
    "Paola le debe a NL (EFE)": paolaDebe,
  });
  T.net += s.net; T.efe += s.efe; T.tar += s.tar;
  T.efeNL += c.nl; T.efeH += c.habbie; T.efeBB += c.bb; T.efeSin += efeSin;
  T.tarNL += tarNL; T.tarH += tarH; T.nlDebe += nlDebe; T.paolaDebe += paolaDebe;
}
rows.push({
  Tienda: "TOTAL", Código: "", Situación: "", "Vendió (Linux)": "",
  "Venta total": T.net, "Efectivo vendido": T.efe,
  "EFE → cuenta NL": T.efeNL, "EFE → cuenta Habbie": T.efeH,
  "EFE → cuenta propia": T.efeBB, "EFE sin registro": T.efeSin,
  "Tarjetas vendidas": T.tar, "TAR → datafono NL": T.tarNL,
  "TAR → datafono Habbie": T.tarH,
  "NL le debe a Paola (TAR post-corte)": T.nlDebe,
  "Paola le debe a NL (EFE)": T.paolaDebe,
});

// Nota: A del cruce usa banco para cerradas ($14.144.615) y archivo para pre-corte.
const A = T.paolaDebe;
const R = 22000000 + 10976384;
const B = T.nlDebe;
const cruce = [
  { Concepto: "NL le debe a Paola: tarjetas de sus tiendas desde el corte recaudadas por datafono NL", Valor: B },
  { Concepto: "NL le debe a Paola: ventas Rappi may-jun pagadas a Natural Light", Valor: RAPPI },
  { Concepto: "Paola le debe a NL: efectivo recibido por ventas pre-corte de sus tiendas", Valor: -(T.paolaDebe - 14144615) },
  { Concepto: "Paola le debe a NL: efectivo de tiendas cerradas que llegó a su banco", Valor: -14144615 },
  { Concepto: "NL ya devolvió (giros 16-abr $22.000.000 y 24-abr $10.976.384)", Valor: -R },
  { Concepto: "SALDO NETO (negativo = Paola le debe a NL)", Valor: B + RAPPI - A - R },
  { Concepto: "", Valor: null },
  { Concepto: "NO entran al cruce: giros NL 21-abr $31M y 24-abr $10M (otro concepto), 23-jun $2.904.813 (factura pan), TI 13-may $2.510.721 (admin devuelta)", Valor: null },
  { Concepto: "Viva Envigado reportó $945.715 y Éxito Sabana $64.450 consignados que NUNCA llegaron al banco de Paola (no se deben)", Valor: null },
];

// ── Consola ──────────────────────────────────────────────────────────────
for (const r of rows) {
  console.log(`\n${r.Tienda} ${r.Código ? `(${r.Código}) — ${r.Situación}, vendió ${r["Vendió (Linux)"]}` : ""}`);
  console.log(`   Venta total ${fmt(r["Venta total"])}  | EFE ${fmt(r["Efectivo vendido"])}  | TAR ${fmt(r["Tarjetas vendidas"])}`);
  console.log(`   EFE → NL ${fmt(r["EFE → cuenta NL"])} | Habbie ${fmt(r["EFE → cuenta Habbie"])} | propia ${fmt(r["EFE → cuenta propia"])} | sin reg ${fmt(r["EFE sin registro"])}`);
  console.log(`   TAR → datafono NL ${fmt(r["TAR → datafono NL"])} | datafono Habbie ${fmt(r["TAR → datafono Habbie"])}`);
  console.log(`   Cruce: NL debe ${fmt(r["NL le debe a Paola (TAR post-corte)"])} | Paola debe ${fmt(r["Paola le debe a NL (EFE)"])}`);
}
console.log(`\nSALDO NETO: B ${fmt(B)} + Rappi ${fmt(RAPPI)} − A ${fmt(A)} − R ${fmt(R)} = ${fmt(B + RAPPI - A - R)}`);

// ── Excel ────────────────────────────────────────────────────────────────
const wb = XLSX.utils.book_new();
const ws1 = XLSX.utils.json_to_sheet(rows);
ws1["!cols"] = Object.keys(rows[0]).map((k, i) => ({ wch: i === 0 ? 22 : i <= 3 ? 16 : 18 }));
XLSX.utils.book_append_sheet(wb, ws1, "Por tienda");
const ws2 = XLSX.utils.json_to_sheet(cruce);
ws2["!cols"] = [{ wch: 95 }, { wch: 16 }];
XLSX.utils.book_append_sheet(wb, ws2, "Cruce Natural Light");
const outPath = `${PP}/Resumen cruce Natural Light.xlsx`;
XLSX.writeFile(wb, outPath);
console.log(`\nExcel generado: ${outPath}`);
