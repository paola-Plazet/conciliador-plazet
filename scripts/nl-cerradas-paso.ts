// Igual que nl-abril-paso pero para las TIENDAS CERRADAS (todas eran de NL,
// no hay corte): cuánto facturó cada una en Linux y a qué cuenta entró.
import * as XLSX from "xlsx";

const SA = "C:/Users/Paola Agreda/OneDrive/Escritorio/PROYECTOS PAO/muestras-conciliacion/sistemas anteriores";
const fmt = (n: number) => "$" + Math.round(n).toLocaleString("es-CO");

const CERRADAS: Record<string, string> = {
  BB: "Éxito Occidente",
  BC: "Viva Envigado",
  BF: "Éxito Sabana",
  BJ: "Éxito San Pedro Neiva",
  BM: "Unicentro Cali",
};
const CUENTAS: Record<string, string> = {
  "300399792": "cuenta HABBIE (tuya)",
  "300221336": "cuenta NATURAL LIGHT",
  "2600124347": "cuenta Éxito Occidente",
  "0": "sin dato de consignación",
};

function fecha(fecVta: unknown, serial: unknown): string | null {
  const m = String(fecVta ?? "").match(/(\d{4}).*?(\d{1,2}).*?(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  const n = Number(serial);
  return Number.isFinite(n) && n > 1 ? new Date(Date.UTC(1899, 11, 30) + n * 86400000).toISOString().slice(0, 10) : null;
}

const wb = XLSX.readFile(`${SA}/ventaSabmyju.xlsx`);
const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true, defval: null }) as unknown[][];
const H = rows[0].map(String);
const c = (n: string) => H.indexOf(n);
const cSuc = c("SUC"), cEfe = c("EFE"), cTar = c("TAR"), cCta = c("CTACTE"), cFv = c("FEC-VTA"), cF = c("FECHA");

let totNL = 0, totHB = 0, totOtra = 0;
for (const [suc, nombre] of Object.entries(CERRADAS)) {
  const efePorCuenta = new Map<string, number>();
  let tar = 0, fmin = "9999", fmax = "0", n = 0;
  for (const r of rows.slice(1)) {
    if (!r || String(r[cSuc]).trim() !== suc) continue;
    const d = fecha(cFv >= 0 ? r[cFv] : null, r[cF]);
    if (!d) continue;
    n++;
    fmin = d < fmin ? d : fmin;
    fmax = d > fmax ? d : fmax;
    const efe = Number(r[cEfe]) || 0;
    if (efe) {
      const cta = String(r[cCta] ?? "0").trim();
      efePorCuenta.set(cta, (efePorCuenta.get(cta) ?? 0) + efe);
    }
    tar += Number(r[cTar]) || 0;
  }
  const efeTot = [...efePorCuenta.values()].reduce((s, v) => s + v, 0);
  console.log(`\n══════ ${nombre} (${suc})   ${fmin} → ${fmax}   facturado ${fmt(efeTot + tar)}`);
  console.log(`   efectivo ${fmt(efeTot)}:`);
  for (const [cta, v] of [...efePorCuenta].sort((a, b) => b[1] - a[1])) {
    console.log(`      → ${(CUENTAS[cta] ?? "cuenta " + cta).padEnd(28)} ${fmt(v).padStart(13)}`);
    if (cta === "300399792") totHB += v;
    else if (cta === "300221336") totNL += v;
    else totOtra += v;
  }
  console.log(`   tarjetas → datáfono de NATURAL      ${fmt(tar).padStart(13)}`);
  totNL += tar;
}
console.log(`\n──────── TOTAL TIENDAS CERRADAS ────────`);
console.log(`   entró a NATURAL (efectivo + datáfono) ${fmt(totNL)}`);
console.log(`   entró a HABBIE (tu cuenta)            ${fmt(totHB)}`);
console.log(`   otras cuentas / sin dato              ${fmt(totOtra)}`);
