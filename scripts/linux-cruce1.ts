// Cruce 1: ventas EFECTIVO del sistema Linux vs consignaciones reportadas
// (archivo "consignaciones linux.xlsx"), por tienda y día de venta.
// También: línea de tiempo de a qué cuenta consignó cada tienda.
import * as XLSX from "xlsx";

const DIR = "C:/Users/Paola Agreda/OneDrive/Escritorio/PROYECTOS PAO/muestras-conciliacion";

function iso(n: number): string {
  return new Date(Date.UTC(1899, 11, 30) + n * 86400000).toISOString().slice(0, 10);
}
const fmt = (n: number) => "$" + Math.round(n).toLocaleString("es-CO");

// ── ventas: EFE por (SUC, fecha) ──
const wbV = XLSX.readFile(`${DIR}/sistemas anteriores/ventaSabmyju.xlsx`);
const rowsV: any[][] = XLSX.utils.sheet_to_json(wbV.Sheets["ventaSabmyju"], { header: 1, raw: true });
const hV = rowsV[0].map(String);
const iF = hV.indexOf("FECHA"), iS = hV.indexOf("SUC"), iE = hV.indexOf("EFE");
const efeByStoreDay = new Map<string, Map<string, number>>();
for (const r of rowsV.slice(1)) {
  if (r[iS] == null || r[iF] == null) continue;
  const suc = String(r[iS]).toUpperCase();
  const day = iso(r[iF]);
  const efe = Number(r[iE] ?? 0);
  if (!efeByStoreDay.has(suc)) efeByStoreDay.set(suc, new Map());
  const m = efeByStoreDay.get(suc)!;
  m.set(day, (m.get(day) ?? 0) + efe);
}

// ── consignaciones: VLR por (SUC, fec.venta), + cuenta ──
const wbC = XLSX.readFile(`${DIR}/sistemas anteriores/consignaciones linux.xlsx`);
const rowsC: any[][] = XLSX.utils.sheet_to_json(wbC.Sheets["consign"], { header: 1, raw: true });
// cols: 0=SU 1=NOMBRE 2=FEC.VENTA 3=FEC.CONSIG 4=VLR 5=NRO.DOC 6=CUENTA
interface Consig { suc: string; name: string; fecVenta: string; fecConsig: string; vlr: number; doc: string; cuenta: string }
const consigs: Consig[] = [];
for (const r of rowsC.slice(1)) {
  if (r[0] == null || r[2] == null) continue;
  consigs.push({
    suc: String(r[0]).toUpperCase(),
    name: String(r[1]),
    fecVenta: iso(r[2]),
    fecConsig: iso(r[3]),
    vlr: Number(r[4] ?? 0),
    doc: String(r[5]),
    cuenta: String(r[6]),
  });
}

// ── línea de tiempo de cuentas por tienda ──
console.log("═══ CUENTA DESTINO POR TIENDA (según fecha de venta) ═══");
const MI_CUENTA = "100300399792";
for (const suc of [...new Set(consigs.map(c => c.suc))].sort()) {
  const cs = consigs.filter(c => c.suc === suc).sort((a, b) => a.fecVenta.localeCompare(b.fecVenta));
  const name = cs[0].name;
  const porCuenta = new Map<string, { min: string; max: string; total: number; n: number }>();
  for (const c of cs) {
    const e = porCuenta.get(c.cuenta) ?? { min: c.fecVenta, max: c.fecVenta, total: 0, n: 0 };
    e.min = e.min < c.fecVenta ? e.min : c.fecVenta;
    e.max = e.max > c.fecVenta ? e.max : c.fecVenta;
    e.total += c.vlr; e.n++;
    porCuenta.set(c.cuenta, e);
  }
  console.log(`\n${suc} ${name}:`);
  for (const [cta, e] of porCuenta) {
    const tag = cta === MI_CUENTA ? " <-- MI CUENTA" : "";
    console.log(`   cta ${cta}: ventas ${e.min} -> ${e.max}, ${e.n} regs, ${fmt(e.total)}${tag}`);
  }
}

// ── cruce venta EFE vs consignado, por (SUC, día) ──
console.log("\n\n═══ VENTA EFECTIVO vs CONSIGNADO (por tienda/día de venta) ═══");
console.log("(solo se muestran días con diferencia > $500)\n");
const consigByStoreDay = new Map<string, Map<string, number>>();
for (const c of consigs) {
  if (!consigByStoreDay.has(c.suc)) consigByStoreDay.set(c.suc, new Map());
  const m = consigByStoreDay.get(c.suc)!;
  m.set(c.fecVenta, (m.get(c.fecVenta) ?? 0) + c.vlr);
}

const allSucs = [...new Set([...efeByStoreDay.keys(), ...consigByStoreDay.keys()])].sort();
let totalFaltante = 0;
for (const suc of allSucs) {
  const ventas = efeByStoreDay.get(suc) ?? new Map<string, number>();
  const consg = consigByStoreDay.get(suc) ?? new Map<string, number>();
  const days = [...new Set([...ventas.keys(), ...consg.keys()])].sort();
  const name = consigs.find(c => c.suc === suc)?.name ?? "?";
  let sumV = 0, sumC = 0, diffDays = 0;
  const lines: string[] = [];
  for (const d of days) {
    const v = ventas.get(d) ?? 0;
    const c = consg.get(d) ?? 0;
    sumV += v; sumC += c;
    if (Math.abs(v - c) > 500) {
      diffDays++;
      lines.push(`   ${d}  vendió ${fmt(v).padStart(13)}  consignó ${fmt(c).padStart(13)}  dif ${fmt(c - v).padStart(13)}`);
    }
  }
  console.log(`── ${suc} ${name}: venta EFE total ${fmt(sumV)}, consignado ${fmt(sumC)}, dif ${fmt(sumC - sumV)} (${diffDays} días con dif)`);
  for (const l of lines) console.log(l);
  totalFaltante += sumC - sumV;
  console.log();
}
console.log(`TOTAL GLOBAL: consignado - vendido = ${fmt(totalFaltante)}`);
