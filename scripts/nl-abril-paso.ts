// Paso a paso del periodo Linux (era Natural Light) por tienda:
// cuánto se facturó en Linux hasta el arranque de Alegra, separado en
// ANTES del corte (ventas de NL) y DESDE el corte (ventas de Paola), y a
// dónde entró la plata: efectivo por cuenta destino (CTACTE de cada fila) y
// tarjetas separadas entre datáfono propio (Plink, por cobertura día-tienda)
// y datáfono de NL.
import * as XLSX from "xlsx";
import { prisma } from "../src/lib/db";

const SA = "C:/Users/Paola Agreda/OneDrive/Escritorio/PROYECTOS PAO/muestras-conciliacion/sistemas anteriores";
const fmt = (n: number) => "$" + Math.round(n).toLocaleString("es-CO");

const TIENDAS: Record<string, { nombre: string; store: string; corte: string }> = {
  BD: { nombre: "Plaza de las Américas", store: "B1", corte: "2026-04-16" },
  Q9: { nombre: "Unioccidente", store: "B2", corte: "2026-04-16" },
  BQ: { nombre: "Unicentro Norte", store: "B3", corte: "2026-04-16" },
  D0: { nombre: "Jardín Plaza", store: "JP", corte: "2026-05-16" },
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

async function main() {
  const wb = XLSX.readFile(`${SA}/ventaSabmyju.xlsx`);
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true, defval: null }) as unknown[][];
  const H = rows[0].map(String);
  const c = (n: string) => H.indexOf(n);
  const cSuc = c("SUC"), cEfe = c("EFE"), cTar = c("TAR"), cCta = c("CTACTE"), cFv = c("FEC-VTA"), cF = c("FECHA");

  // Plink (datáfono TUYO) por tienda-día, para separar tarjetas propias vs NL
  const plinkRows = await prisma.dataphoneEntry.findMany({ where: { txDate: { lte: "2026-05-31" } } });
  const plink = new Map<string, number>();
  for (const p of plinkRows) if (p.storeCode) plink.set(`${p.storeCode}|${p.txDate}`, (plink.get(`${p.storeCode}|${p.txDate}`) ?? 0) + p.gross);

  for (const [suc, t] of Object.entries(TIENDAS)) {
    interface Acum { efePorCuenta: Map<string, number>; tarNL: number; tarPlink: number; dias: Set<string>; fmin: string; fmax: string }
    const nuevo = (): Acum => ({ efePorCuenta: new Map(), tarNL: 0, tarPlink: 0, dias: new Set(), fmin: "9999", fmax: "0" });
    const pre = nuevo(), post = nuevo();
    // tarjetas por día para asignar contra Plink
    const tarDia = new Map<string, number>();

    for (const r of rows.slice(1)) {
      if (!r || String(r[cSuc]).trim() !== suc) continue;
      const d = fecha(cFv >= 0 ? r[cFv] : null, r[cF]);
      if (!d) continue;
      // Jardín Plaza no operó antes de su corte: lo único que hay son 2
      // devoluciones negativas de abril (época NL) — se excluyen (pedido Paola).
      if (suc === "D0" && d < t.corte) continue;
      const a = d < t.corte ? pre : post;
      a.dias.add(d);
      a.fmin = d < a.fmin ? d : a.fmin;
      a.fmax = d > a.fmax ? d : a.fmax;
      const efe = Number(r[cEfe]) || 0;
      const tar = Number(r[cTar]) || 0;
      if (efe) {
        const cta = String(r[cCta] ?? "0").trim();
        a.efePorCuenta.set(cta, (a.efePorCuenta.get(cta) ?? 0) + efe);
      }
      if (tar) tarDia.set(d, (tarDia.get(d) ?? 0) + tar);
    }

    // tarjetas: por día, lo cubierto por TU Plink es tuyo; el resto fue al datáfono NL
    for (const [d, tar] of tarDia) {
      const a = d < t.corte ? pre : post;
      const mio = Math.min(tar, plink.get(`${t.store}|${d}`) ?? 0);
      a.tarPlink += mio;
      a.tarNL += tar - mio;
    }

    const efeTotal = (x: Acum) => [...x.efePorCuenta.values()].reduce((s, v) => s + v, 0);
    const total = (x: Acum) => efeTotal(x) + x.tarNL + x.tarPlink;

    console.log(`\n══════════ ${t.nombre} (${suc}) — corte a Habbie: ${t.corte} ══════════`);
    for (const [titulo, a] of [["ANTES del corte (ventas de NL)", pre], ["DESDE el corte (ventas TUYAS)", post]] as const) {
      if (a.dias.size === 0) { console.log(`\n   ${titulo}: (no aplica)`); continue; }
      console.log(`\n   ${titulo}   ${a.fmin} → ${a.fmax}  (${a.dias.size} días)`);
      console.log(`   FACTURADO en Linux: ${fmt(total(a))}   (efectivo ${fmt(efeTotal(a))} + tarjeta ${fmt(a.tarNL + a.tarPlink)})`);
      for (const [cta, v] of [...a.efePorCuenta].sort((x, y) => y[1] - x[1]))
        console.log(`      efectivo → ${(CUENTAS[cta] ?? "cuenta " + cta).padEnd(28)} ${fmt(v).padStart(13)}`);
      if (a.tarPlink) console.log(`      tarjeta  → tu datáfono (Plink)         ${fmt(a.tarPlink).padStart(13)}`);
      if (a.tarNL) console.log(`      tarjeta  → datáfono de NATURAL         ${fmt(a.tarNL).padStart(13)}`);
    }
  }
  process.exit(0);
}
main();
