import * as XLSX from "xlsx";
const f = process.argv[2];
const wb = XLSX.readFile(f, { cellDates: true });
console.log("HOJAS:", wb.SheetNames.join(" | "));
for (const name of wb.SheetNames) {
  const ws = wb.Sheets[name];
  const rows = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, raw: false, defval: "" });
  console.log(`\n== ${name}: ${rows.length} filas`);
  for (let i = 0; i < Math.min(4, rows.length); i++) console.log(i, JSON.stringify(rows[i]).slice(0, 700));
  const hits = rows.filter((r) => r.some((c) => String(c).includes("7949")));
  console.log("filas con 7949:", hits.length);
  for (const h of hits.slice(0, 6)) console.log("  ", JSON.stringify(h).slice(0, 700));
}
