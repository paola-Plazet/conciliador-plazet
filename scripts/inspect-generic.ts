import * as XLSX from "xlsx";
const wb = XLSX.readFile(process.argv[2], { cellDates: true });
console.log("hojas:", wb.SheetNames.join(" | "));
for (const name of wb.SheetNames) {
  const rows = XLSX.utils.sheet_to_json<any[]>(wb.Sheets[name], { header: 1, raw: false, defval: "" });
  console.log(`\n== ${name}: ${rows.length} filas`);
  for (let i = 0; i < Math.min(12, rows.length); i++) console.log(i, JSON.stringify(rows[i]).slice(0, 500));
  if (rows.length > 12) { console.log("…"); for (let i = Math.max(12, rows.length - 4); i < rows.length; i++) console.log(i, JSON.stringify(rows[i]).slice(0, 500)); }
}
