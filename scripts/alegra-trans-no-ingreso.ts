import * as XLSX from "xlsx";
const rows = XLSX.utils.sheet_to_json<Record<string, any>>(XLSX.readFile("C:/Users/Paola Agreda/Downloads/Alegra - Reporte de transacciones - HABBIE SAS -.xlsx").Sheets["Worksheet"], { raw: false, defval: "" });
const tipos: Record<string, { n: number; v: number }> = {};
for (const r of rows) { const k = `${r["Tipo"]} | ${r["Cuenta"]}`.slice(0, 60); tipos[k] = tipos[k] ?? { n: 0, v: 0 }; tipos[k].n++; tipos[k].v += Number(String(r["Valor"]).replace(/[^\d.-]/g, "")) || 0; }
console.log("TIPO | CUENTA (no Ingreso):");
for (const [k, x] of Object.entries(tipos).sort((a, b) => b[1].n - a[1].n)) if (!k.startsWith("Ingreso")) console.log(`   ${k.padEnd(62)} ${x.n} ${Math.round(x.v).toLocaleString("es-CO")}`);
console.log("\nfilas NO ingreso 27-may → 2-jun:");
for (const r of rows) if (r["Tipo"] !== "Ingreso" && /\/0[56]\/2026/.test(String(r["Fecha"])) && ["27/05/2026", "28/05/2026", "29/05/2026", "30/05/2026", "31/05/2026", "01/06/2026", "02/06/2026"].includes(String(r["Fecha"]))) console.log(`   ${r["Fecha"]} ${String(r["Tipo"]).padEnd(12)} ${String(r["Cuenta"]).padEnd(40)} ${String(r["Valor"]).padStart(9)} ${String(r["Método de pago"]).padEnd(14)} ${String(r["Asociaciones"]).slice(0, 40)} ${r["Cliente"]}`);
