// Carga a la app TODO lo que haya en la carpeta de muestras: detecta el tipo de
// cada archivo, descomprime los .zip (CSV 191 del QR) y lo ingiere en el libro.
//
//   npx tsx scripts/cargar-carpeta.ts [carpeta]
//
// Orden de carga: banco / datáfono / QR / Alegra y, de último, Karrot (desde el
// corte 8-jul la fuente de ventas es Karrot y debe quedar por encima).
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFileSync } from "node:child_process";
import { detectFileType, type FileKind } from "../src/lib/parsers/detect";
import { ingestFiles, computeLedger } from "../src/lib/ledger";

const CARPETA =
  process.argv[2] ??
  "C:/Users/Paola Agreda/OneDrive/Escritorio/PROYECTOS PAO/muestras-conciliacion";

const ORDEN: Record<string, number> = {
  banco: 1,
  datafono: 2,
  datafono_banco: 3,
  mercadopago: 3,
  linux: 0, // sistema anterior: base de abril/mayo, se carga primero
  alegra: 4,
  alegra_trans: 4,
  karrot: 8,
  karrot_ventas: 9, // el reporte_ventas manda sobre el allsales (pagos mixtos)
};

/** Descomprime un .zip a una carpeta temporal y devuelve los archivos internos */
function abrirZip(zip: string): string[] {
  const dest = path.join(os.tmpdir(), "conciliador-zip", path.basename(zip, ".zip"));
  fs.rmSync(dest, { recursive: true, force: true });
  fs.mkdirSync(dest, { recursive: true });
  execFileSync("powershell", [
    "-NoProfile",
    "-Command",
    `Expand-Archive -LiteralPath '${zip}' -DestinationPath '${dest}' -Force`,
  ]);
  const salida: string[] = [];
  const walk = (dir: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else salida.push(p);
    }
  };
  walk(dest);
  return salida;
}

async function main() {
  const rutas: string[] = [];
  for (const e of fs.readdirSync(CARPETA, { withFileTypes: true })) {
    if (!e.isFile()) continue;
    const p = path.join(CARPETA, e.name);
    const ext = path.extname(e.name).toLowerCase();
    if (ext === ".zip") rutas.push(...abrirZip(p));
    else if ([".xlsx", ".xls", ".csv"].includes(ext)) rutas.push(p);
  }
  // Solo el archivo de ventas de Linux del subfolder "sistemas anteriores"
  // (los demás de esa carpeta son referencia, no se cargan).
  const linuxFile = path.join(CARPETA, "sistemas anteriores", "ventaSabmyju.xlsx");
  if (fs.existsSync(linuxFile)) rutas.push(linuxFile);

  const candidatos = rutas.map((p) => {
    const buffer = fs.readFileSync(p);
    const filename = path.basename(p);
    const { kind, reason } = detectFileType(filename, buffer);
    return { filename, buffer, kind, reason };
  });

  console.log(`Carpeta: ${CARPETA}\n`);
  const files: { filename: string; buffer: Buffer }[] = [];
  for (const c of candidatos.sort((a, b) => (ORDEN[a.kind] ?? 5) - (ORDEN[b.kind] ?? 5))) {
    const ok = c.kind in ORDEN;
    console.log(`${ok ? "✓" : "·"} ${c.filename.padEnd(60)} ${c.kind}`);
    if (ok) files.push({ filename: c.filename, buffer: c.buffer });
  }
  if (files.length === 0) return console.log("\nNada que cargar.");

  console.log("\nIngresando...");
  const out = await ingestFiles(files);
  for (const f of out.files)
    console.log(
      `   ${f.filename.padEnd(60)} ${String(f.inserted).padStart(6)} filas  ${f.from ?? "-"} → ${f.to ?? "-"}`,
    );
  for (const w of out.warnings) console.log(`   ⚠ ${w}`);

  const st = await computeLedger();
  console.log("\nCortes:", JSON.stringify(st.cut));
  console.log("Meses:");
  for (const m of st.months)
    console.log(
      `   ${m.month}  cuadran ${m.totals.cuadran} | dif ${m.totals.diferencias} | sin conciliar ${m.totals.sinConciliar} | tardías ${m.totals.tardias}${m.clean ? "  ✔ limpio" : ""}${m.closed ? " (CERRADO)" : ""}`,
    );
  process.exit(0);
}
main();
