// ¿Los días de junio sin depósito de efectivo se explican por plata que entró
// como PAGO QR? Compara venta QR vs banco QR día a día en junio y julio.
import fs from "node:fs";
import path from "node:path";
import { parseAlegraTrans } from "../src/lib/parsers/alegra-trans";
import { parseDatafonoBanco } from "../src/lib/parsers/datafono-banco";
import * as XLSX from "xlsx";

const MC = "C:/Users/Paola Agreda/OneDrive/Escritorio/PROYECTOS PAO/muestras-conciliacion";
const fmt = (n: number) => "$" + Math.round(n).toLocaleString("es-CO");

// venta QR por día (Alegra ≤7-jul + Karrot ≥8-jul)
const ventaQr = new Map<string, number>();
const add = (m: Map<string, number>, k: string, v: number) => m.set(k, (m.get(k) ?? 0) + v);
const alegra = parseAlegraTrans(fs.readFileSync(`${MC}/sistemas anteriores/Alegra - Reporte de transacciones - HABBIE SAS -.xlsx`));
for (const s of alegra.sales)
  if (s.method === "TRANSFERENCIA" && s.storeCode && s.date >= "2026-06-01" && s.date <= "2026-07-07") add(ventaQr, s.date, s.amount);
{
  const wbk = XLSX.read(fs.readFileSync(`${MC}/allsales-a2b47fd9-3c80-4506-8700-49c3de1b8966-20260716T234911269Z.xlsx`));
  const rows: any[][] = XLSX.utils.sheet_to_json(wbk.Sheets[wbk.SheetNames[0]], { header: 1 });
  const H = rows[0].map((c: any) => String(c ?? ""));
  const i = (n: string) => H.findIndex((h) => h === n);
  const iMet = i("Método de Pago Principal"), iFecha = i("Fecha"), iVenta = i("Venta"), iAlm = i("Nombre Almacén");
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    if (!row) continue;
    const d = String(row[iFecha] ?? "");
    if (String(row[iMet]) === "Transferencia" && d >= "2026-07-08" && !["NL", "Tienda Shopify"].includes(String(row[iAlm])))
      add(ventaQr, d, Number(row[iVenta] ?? 0));
  }
}
// banco QR
const bancoQr = new Map<string, number>();
const claves = new Set<string>();
const walk = (d: string) => {
  for (const f of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, f.name);
    if (f.isDirectory()) walk(p);
    else if (/^CSV_19100003911_.*\.csv$/i.test(f.name)) {
      const out = parseDatafonoBanco(fs.readFileSync(p));
      const local = new Map<string, number>();
      for (const q of out.qr) {
        const base = `${q.date}|${q.amount}|${q.payer}`;
        const n = (local.get(base) ?? 0) + 1;
        local.set(base, n);
        if (claves.has(`${base}|${n}`)) continue;
        claves.add(`${base}|${n}`);
        add(bancoQr, q.date, q.amount);
      }
    }
  }
};
walk("C:/Users/Paola Agreda/Downloads");
walk("C:/Users/PAOLAA~1/AppData/Local/Temp/claude/C--Users-Paola-Agreda/7720aa15-7adf-4037-a9b8-80a2e1315e28/scratchpad/csv191");
walk(MC);

console.log("día        venta QR      banco QR      dif (banco de más = posible efectivo por QR)");
let sv = 0, sb = 0;
for (let ts = Date.parse("2026-06-01T00:00:00Z"); ts <= Date.parse("2026-07-16T00:00:00Z"); ts += 86400000) {
  const d = new Date(ts).toISOString().slice(0, 10);
  const v = ventaQr.get(d) ?? 0, b = bancoQr.get(d) ?? 0;
  sv += v; sb += b;
  if (Math.abs(v - b) >= 1000) console.log(`${d}  ${fmt(v).padStart(11)}  ${fmt(b).padStart(11)}  ${fmt(b - v).padStart(11)}`);
}
console.log(`TOTAL 1-jun→16-jul: venta ${fmt(sv)} banco ${fmt(sb)} → banco de más ${fmt(sb - sv)}`);
