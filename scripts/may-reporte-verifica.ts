// Lee el Excel de conciliación de mayo y lista todas las diferencias resaltadas.
import * as XLSX from "xlsx";

const wb = XLSX.readFile("C:/Users/Paola Agreda/OneDrive/Escritorio/PROYECTOS PAO/Conciliacion mayo 2026.xlsx");
const fmt = (n: number) => "$" + Math.round(n).toLocaleString("es-CO");

for (const name of wb.SheetNames) {
  const rows: any[][] = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1 });
  console.log(`== ${name} ==`);
  for (const r of rows) {
    if (!r) continue;
    if (name === "QR (empresa)") {
      const dif = r[7];
      if (typeof dif === "number" && Math.abs(dif) >= 500)
        console.log(`   ${r[0]}  venta ${fmt(r[5])} banco ${fmt(r[6])} dif ${fmt(dif)}`);
      if (String(r[8] ?? "").includes("extracto")) console.log(`   ${r[0]}  venta QR ${fmt(r[5])} SIN EXTRACTO DEL DÍA`);
      if (r[0] === "TOTAL") console.log(`   TOTAL venta ${fmt(r[5])} banco ${fmt(r[6])} dif ${fmt(r[7])}`);
      continue;
    }
    if (name === "Resumen") continue;
    const difE = r[4], difT = r[7];
    if (typeof difE === "number" && Math.abs(difE) >= 500)
      console.log(`   ${r[0]}  DIF EFECTIVO ${fmt(difE)}${r[3] ? ` (depósito cubre días ${r[3]})` : ""}`);
    if (String(r[2]) === "SIN DEPÓSITO") console.log(`   ${r[0]}  SIN DEPÓSITO, venta ${fmt(r[1])}`);
    if (typeof difT === "number" && Math.abs(difT) >= 500) console.log(`   ${r[0]}  dif tarjetas ${fmt(difT)}`);
    if (typeof r[2] === "number" && r[0] && /^\d{2}-\d{2}$/.test(String(r[0])) && r[1] == null)
      console.log(`   ${r[0]}  DEPÓSITO SIN CALCE ${fmt(r[2])}`);
  }
}
