import * as XLSX from "xlsx";
const rows = XLSX.utils.sheet_to_json<Record<string, any>>(XLSX.readFile("C:/Users/Paola Agreda/Downloads/Alegra - Reporte de transacciones - HABBIE SAS -.xlsx").Sheets["Worksheet"], { raw: false, defval: "" });
for (const fac of ["B2182", "B2941"]) {
  console.log(`\nfilas cuyo Asociaciones contiene ${fac}:`);
  for (const r of rows.filter((x) => String(x["Asociaciones"]).includes(fac))) console.log(`   ${r["Fecha"]} #${r["Número"]} ${String(r["Cuenta"]).padEnd(40)} ${String(r["Valor"]).padStart(8)} ${String(r["Método de pago"]).padEnd(14)} ${r["Tipo"]} ${JSON.stringify(r["Asociaciones"])} ${r["Cliente"]} | obs=${r["Observaciones"]} notas=${r["Notas"]}`);
}
const dia = rows.filter((x) => x["Fecha"] === "29/05/2026" && String(x["Cuenta"]).includes("UNIOCCIDENTE"));
console.log("\nUnioccidente 29-may filas Efectivo POS:", dia.length);
for (const r of dia) console.log(`   #${r["Número"]} ${String(r["Valor"]).padStart(8)} ${String(r["Método de pago"]).padEnd(14)} ${r["Asociaciones"]} ${r["Cliente"]}`);
