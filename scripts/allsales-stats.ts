import * as XLSX from "xlsx";
const f = process.argv[2];
const wb = XLSX.readFile(f);
const rows = XLSX.utils.sheet_to_json<Record<string, any>>(wb.Sheets[wb.SheetNames[0]], { raw: false, defval: "" });
const met: Record<string, { n: number; v: number }> = {};
const porFactura = new Map<string, { metodos: Set<string>; n: number; fecha: string; store: string; cancel: string; canal: string; total: number }>();
let fmin = "9999", fmax = "";
for (const r of rows) {
  const m = String(r["Nombre Método de Pago"] ?? "").trim() || "(vacío)";
  const v = Number(String(r["Valor Método de Pago"]).replace(/[^\d.-]/g, "")) || 0;
  met[m] = met[m] ?? { n: 0, v: 0 }; met[m].n++; met[m].v += v;
  const k = `${r["Código Almacén"]}|${r["# Factura"]}`;
  const e = porFactura.get(k) ?? { metodos: new Set(), n: 0, fecha: r["Fecha"], store: r["Código Almacén"], cancel: r["Cancelado"], canal: r["Canal de Venta"], total: 0 };
  e.metodos.add(m); e.n++; e.total += v; porFactura.set(k, e);
  const d = String(r["Fecha"]); if (d < fmin) fmin = d; if (d > fmax) fmax = d;
}
console.log("filas", rows.length, "facturas", porFactura.size, "rango", fmin, "→", fmax);
console.log("MÉTODOS:", Object.entries(met).sort((a, b) => b[1].n - a[1].n).map(([k, x]) => `${k}: ${x.n} / $${Math.round(x.v).toLocaleString("es-CO")}`).join("\n  "));
const multi = [...porFactura.values()].filter((e) => e.metodos.size > 1);
console.log("\nFACTURAS CON 2+ MÉTODOS:", multi.length, "de", porFactura.size);
const porMes: Record<string, number> = {}; for (const e of multi) porMes[e.fecha.slice(0, 7)] = (porMes[e.fecha.slice(0, 7)] ?? 0) + 1;
console.log("  por mes:", JSON.stringify(porMes));
const combos: Record<string, number> = {}; for (const e of multi) { const c = [...e.metodos].sort().join(" + "); combos[c] = (combos[c] ?? 0) + 1; }
console.log("  combos:", JSON.stringify(combos, null, 0));
const dup = [...porFactura.values()].filter((e) => e.metodos.size === 1 && e.n > 1);
console.log("FACTURAS con mismo método repetido en 2+ filas:", dup.length);
console.log("CANCELADO valores:", JSON.stringify([...new Set(rows.map((r) => r["Cancelado"]))]), "CANAL:", JSON.stringify([...new Set(rows.map((r) => r["Canal de Venta"]))]), "TIPO ORDEN:", JSON.stringify([...new Set(rows.map((r) => r["Tipo de Orden"]))]), "ALMACEN:", JSON.stringify([...new Set(rows.map((r) => r["Código Almacén"] + "=" + r["Nombre Almacén"]))]));
const canc = rows.filter((r) => r["Cancelado"] !== "No"); console.log("filas canceladas:", canc.length, canc.slice(0, 2).map((r) => `${r["# Factura"]} ${r["Fecha"]} ${r["Nombre Método de Pago"]} ${r["Valor Método de Pago"]}`).join(" ; "));
