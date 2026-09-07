import * as XLSX from "xlsx";
const wb = XLSX.readFile(process.argv[2]);
const rows = (n: string) => XLSX.utils.sheet_to_json<any[]>(wb.Sheets[n], { header: 1, raw: false, defval: "" });
console.log("== HISTORIAL DE PAGOS");
for (const r of rows("Historial de Pagos").slice(2)) if (r[0]) console.log("  ", r.slice(0, 7).join(" | "));
console.log("\n== VENTAS POR ORDEN (todas)");
for (const r of rows("1. Ventas por Orden").slice(3)) if (r[1]) console.log(`   ${r[2].padEnd(42)} orden ${r[1]} ${String(r[5]).padEnd(28)} ${String(r[6]).padEnd(5)} bruto ${String(r[7]).padStart(11)} neto ${String(r[8]).padStart(11)} comisión ${String(r[11]).padStart(10)} estado ${r[4]}`);
console.log("\n== RESUMEN (filas con texto)");
for (const r of rows("Resumen")) { const t = r.filter((c) => String(c).trim() !== ""); if (t.length) console.log("  ", t.join(" | ").slice(0, 160)); }
