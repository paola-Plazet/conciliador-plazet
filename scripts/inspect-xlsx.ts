import * as XLSX from "xlsx";
for (const f of process.argv.slice(2)) {
  const wb = XLSX.readFile(f, { cellDates: true });
  console.log(`\n##### ${f} — hojas: ${wb.SheetNames.join(" | ")}`);
  for (const name of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json<any[]>(wb.Sheets[name], { header: 1, raw: false, defval: "" });
    console.log(`== ${name}: ${rows.length} filas`);
    for (let i = 0; i < Math.min(5, rows.length); i++) console.log(i, JSON.stringify(rows[i]).slice(0, 600));
    const buscados = ["35650", "20600", "74450", "20750", "85800", "239750"];
    const hits = rows.filter((r) => r.some((c) => buscados.includes(String(c).replace(/[.,]00$/, "").replace(/[.,]/g, ""))));
    console.log("filas con montos buscados:", hits.length);
    for (const h of hits.slice(0, 12)) console.log("  ", JSON.stringify(h).slice(0, 500));
  }
}
