// Inspecciona la hoja ALIANZA EFECTIVO cruda buscando los depósitos grandes
// de Natural Light (devolución de tarjetas) y cualquier entrada que NO sea
// recaudo de efectivo normal, en abril-mayo.
import * as XLSX from "xlsx";

const src = XLSX.readFile(
  "C:/Users/Paola Agreda/OneDrive/Escritorio/conciliacion.xlsx",
);
const sh = src.Sheets["ALIANZA EFECTIVO"];
const rows: any[][] = XLSX.utils.sheet_to_json(sh, { header: 1, raw: true });

console.log("Primeras 3 filas (encabezados):");
for (let i = 0; i < 3; i++) console.log(i, JSON.stringify(rows[i]));

// Detectar fila de encabezado
const headerIdx = rows.findIndex(
  (r) => r && r.some((c) => typeof c === "string" && /fecha/i.test(c)),
);
console.log("\nFila encabezado:", headerIdx, JSON.stringify(rows[headerIdx]));
const header = rows[headerIdx].map((c: any) => String(c ?? ""));

const fmt = (n: number) =>
  "$" + Math.round(n).toLocaleString("es-CO");

function toDate(v: any): string {
  if (typeof v === "number")
    return new Date(Date.UTC(1899, 11, 30) + v * 86400000)
      .toISOString()
      .slice(0, 10);
  return String(v ?? "");
}

// Volcar TODAS las filas de datos con su descripción, agrupando por tipo
const tipos = new Map<string, { n: number; total: number }>();
const grandes: string[] = [];

for (let i = headerIdx + 1; i < rows.length; i++) {
  const r = rows[i];
  if (!r || r.length === 0) continue;
  const obj: Record<string, any> = {};
  header.forEach((h, k) => (obj[h] = r[k]));

  const desc = header
    .map((h, k) => r[k])
    .filter((v) => typeof v === "string")
    .join(" | ");
  const nums = r.filter((v) => typeof v === "number" && Math.abs(v) > 1000);
  const amount = nums.length ? (nums[nums.length - 1] as number) : 0;
  const date = toDate(r[header.findIndex((h) => /fecha/i.test(h))]);

  // clasificar por primera palabra clave de la descripción
  const key = desc.replace(/\d+/g, "#").slice(0, 60);
  const t = tipos.get(key) ?? { n: 0, total: 0 };
  t.n++;
  t.total += amount;
  tipos.set(key, t);

  if (Math.abs(amount) >= 1_000_000 || /natural|transf|abono|traslado/i.test(desc)) {
    grandes.push(`${date}  ${fmt(amount).padStart(15)}  ${desc}`);
  }
}

console.log("\n== Tipos de movimiento (desc con dígitos → #) ==");
for (const [k, v] of [...tipos.entries()].sort((a, b) => b[1].total - a[1].total))
  console.log(`${String(v.n).padStart(4)}x ${fmt(v.total).padStart(16)}  ${k}`);

console.log(`\n== Movimientos ≥ $1M o con NATURAL/TRANSF/ABONO/TRASLADO (${grandes.length}) ==`);
for (const g of grandes.sort()) console.log(g);
