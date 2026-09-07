// Carga UNO O VARIOS archivos a la app por el mismo camino que la página /cargar
// (detección + ingesta + recálculo).   npx tsx scripts/cargar-archivo.ts <ruta> [<ruta> ...]
import fs from "node:fs";
import path from "node:path";
import { detectFileType } from "../src/lib/parsers/detect";
import { ingestFiles, computeLedger } from "../src/lib/ledger";
async function main() {
  const rutas = process.argv.slice(2).filter((p) => fs.existsSync(p));
  if (!rutas.length) { console.log("Uso: npx tsx scripts/cargar-archivo.ts <archivo> [...]"); process.exit(1); }
  const files = rutas.map((p) => ({ filename: path.basename(p), buffer: fs.readFileSync(p) }));
  for (const f of files) console.log(f.filename, "→", JSON.stringify(detectFileType(f.filename, f.buffer)));
  const out = await ingestFiles(files);
  for (const f of out.files) console.log(`   ${f.filename}: ${f.inserted} filas  ${f.from ?? "-"} → ${f.to ?? "-"}  (omitidas ${f.skipped})`);
  for (const w of out.warnings) console.log(`   ⚠ ${w}`);
  const st = await computeLedger();
  console.log("Cortes:", JSON.stringify(st.cut));
  for (const m of st.months)
    console.log(`   ${m.month}  cuadran ${m.totals.cuadran} | dif ${m.totals.diferencias} | sin conciliar ${m.totals.sinConciliar} | tardías ${m.totals.tardias}${m.clean ? "  ✔ limpio" : ""}${m.closed ? " (CERRADO)" : ""}`);
  process.exit(0);
}
main();
