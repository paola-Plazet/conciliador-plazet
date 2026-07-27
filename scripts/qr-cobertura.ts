// Cobertura de los extractos CSV 191 (datafono/QR): rango de fechas de PAGO QR
// por archivo, y días de mayo cubiertos por la unión de todos.
import fs from "node:fs";
import path from "node:path";
import { parseDatafonoBanco } from "../src/lib/parsers/datafono-banco";

const fmt = (n: number) => "$" + Math.round(n).toLocaleString("es-CO");
const files: string[] = [];
for (const dir of [
  "C:/Users/Paola Agreda/Downloads",
  "C:/Users/PAOLAA~1/AppData/Local/Temp/claude/C--Users-Paola-Agreda/7720aa15-7adf-4037-a9b8-80a2e1315e28/scratchpad/csv191",
]) {
  const walk = (d: string) => {
    for (const f of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, f.name);
      if (f.isDirectory()) walk(p);
      else if (/^CSV_19100003911_.*\.csv$/i.test(f.name)) files.push(p);
    }
  };
  walk(dir);
}

const porDia = new Map<string, Set<string>>(); // fecha -> set de claves únicas (dedupe entre archivos)
const montoPorClave = new Map<string, number>();
for (const f of files.sort()) {
  const out = parseDatafonoBanco(fs.readFileSync(f));
  if (!out.qr.length) { console.log(`${path.basename(f)}  (sin QR)`); continue; }
  const dates = out.qr.map((q) => q.date).sort();
  console.log(
    `${path.basename(f).padEnd(52)} QR ${dates[0]} → ${dates[dates.length - 1]}  ${String(out.qr.length).padStart(4)} pagos  ${fmt(out.totalQr).padStart(13)}`,
  );
  // dedupe global por (fecha|monto|pagador|índice de repetición dentro del día)
  const vistoLocal = new Map<string, number>();
  for (const q of out.qr) {
    const base = `${q.date}|${q.amount}|${q.payer}`;
    const n = (vistoLocal.get(base) ?? 0) + 1;
    vistoLocal.set(base, n);
    const clave = `${base}|${n}`;
    const set = porDia.get(q.date) ?? new Set();
    set.add(clave);
    porDia.set(q.date, set);
    montoPorClave.set(clave, q.amount);
  }
}

console.log("\nCobertura MAYO (unión de todos los archivos, pagos únicos):");
let totalMayo = 0;
const faltantes: string[] = [];
for (let ts = Date.parse("2026-05-01T00:00:00Z"); ts <= Date.parse("2026-05-31T00:00:00Z"); ts += 86400000) {
  const d = new Date(ts).toISOString().slice(0, 10);
  const set = porDia.get(d);
  if (!set) { faltantes.push(d.slice(5)); continue; }
  let s = 0;
  for (const k of set) s += montoPorClave.get(k) ?? 0;
  totalMayo += s;
  console.log(`   ${d}  ${String(set.size).padStart(3)} pagos  ${fmt(s).padStart(12)}`);
}
console.log(`   TOTAL mayo (días cubiertos): ${fmt(totalMayo)}`);
console.log(faltantes.length ? `   DÍAS SIN EXTRACTO: ${faltantes.join(", ")}` : "   ✔ mayo completo");
