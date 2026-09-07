// Carga UN archivo a la app por el mismo camino que la página /cargar
// (detección + ingesta + recálculo).   npx tsx scripts/cargar-archivo.ts <ruta>
import fs from "node:fs";
import path from "node:path";
import { detectFileType } from "../src/lib/parsers/detect";
import { ingestFiles, computeLedger } from "../src/lib/ledger";
async function main() {
  const p = process.argv[2];
  if (!p || !fs.existsSync(p)) { console.log("Uso: npx tsx scripts/cargar-archivo.ts <archivo>"); process.exit(1); }
  const buffer = fs.readFileSync(p);
  const filename = path.basename(p);
  console.log(filename, "→", JSON.stringify(detectFileType(filename, buffer)));
  const out = await ingestFiles([{ filename, buffer }]);
  for (const f of out.files) console.log(`   ${f.filename}: ${f.inserted} filas  ${f.from ?? "-"} → ${f.to ?? "-"}  (omitidas ${f.skipped})`);
  for (const w of out.warnings) console.log(`   ⚠ ${w}`);
  const st = await computeLedger();
  console.log("Cortes:", JSON.stringify(st.cut));
  for (const m of st.months)
    console.log(`   ${m.month}  cuadran ${m.totals.cuadran} | dif ${m.totals.diferencias} | sin conciliar ${m.totals.sinConciliar} | tardías ${m.totals.tardias}${m.clean ? "  ✔ limpio" : ""}${m.closed ? " (CERRADO)" : ""}`);
  process.exit(0);
}
main();
