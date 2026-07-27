// Detalles complementarios del cruce NL:
// 1) TAR de las 4 tiendas de Paola ANTES del corte (¿las transferencias de NL
//    cubrían también eso?)
// 2) Calce exacto JP: depósitos ref 3172560775 desde 16-may vs ventas EFE acumuladas
import * as XLSX from "xlsx";

const DIR =
  "C:/Users/Paola Agreda/OneDrive/Escritorio/PROYECTOS PAO/muestras-conciliacion/sistemas anteriores";
const fmt = (n: number) => "$" + Math.round(n).toLocaleString("es-CO");
const toDate = (v: any): string =>
  typeof v === "number"
    ? new Date(Date.UTC(1899, 11, 30) + v * 86400000).toISOString().slice(0, 10)
    : String(v ?? "").trim();

const vWb = XLSX.readFile(`${DIR}/ventaSabmyju.xlsx`);
const ventas: any[] = XLSX.utils.sheet_to_json(vWb.Sheets["ventaSabmyju"]);

const CORTE: Record<string, string> = {
  BQ: "2026-04-16",
  Q9: "2026-04-16",
  BD: "2026-04-16",
  D0: "2026-05-16",
};
const NOMBRE: Record<string, string> = {
  BQ: "Unicentro Norte",
  Q9: "Unioccidente",
  BD: "Plaza de las Américas",
  D0: "Jardín Plaza",
};

console.log("1) TAR de tiendas de Paola ANTES del corte (época Linux, es de NL según la regla):");
let pre = 0;
for (const suc of Object.keys(CORTE)) {
  let s = 0;
  for (const r of ventas) {
    if (String(r.SUC ?? "").trim() !== suc) continue;
    const d = toDate(r.FECHA);
    if (d < CORTE[suc]) s += Number(r.TAR ?? 0);
  }
  pre += s;
  console.log(`   ${NOMBRE[suc].padEnd(24)} ${fmt(s).padStart(14)}`);
}
console.log(`   TOTAL TAR pre-corte tiendas de Paola: ${fmt(pre)}`);

// 2) JP: calce secuencial depósitos vs ventas EFE
const efeJP = new Map<string, number>();
for (const r of ventas) {
  if (String(r.SUC ?? "").trim() !== "D0") continue;
  const d = toDate(r.FECHA);
  if (d < "2026-05-16") continue;
  efeJP.set(d, (efeJP.get(d) ?? 0) + Number(r.EFE ?? 0));
}
const days = [...efeJP.entries()].sort();
const bWb = XLSX.readFile("C:/Users/Paola Agreda/OneDrive/Escritorio/conciliacion.xlsx");
const bRows: any[] = XLSX.utils.sheet_to_json(bWb.Sheets["ALIANZA EFECTIVO"]);
const deps = bRows
  .map((r) => ({
    date: toDate(r["Fecha Tran"]),
    valor: Number(r["Valor"] ?? 0),
    ref: String(r["Concepto"] ?? "").match(/RECAUDO REFE:\s*(\d+)/)?.[1],
  }))
  .filter((b) => b.ref && String(Number(b.ref)) === "3172560775" && b.date >= "2026-05-16" && b.date <= "2026-05-31")
  .sort((a, b) => a.date.localeCompare(b.date));

console.log("\n2) JP desde 16-may: calce secuencial depósito ↔ días de venta EFE:");
let ptr = 0;
for (const dep of deps) {
  let cum = 0;
  const used: string[] = [];
  let j = ptr;
  while (j < days.length && Math.abs(cum - dep.valor) > 500 && cum < dep.valor + 500) {
    cum += days[j][1];
    used.push(days[j][0].slice(5));
    j++;
  }
  const ok = Math.abs(cum - dep.valor) <= 500;
  if (ok) ptr = j;
  console.log(
    `   dep ${dep.date} ${fmt(dep.valor).padStart(12)} ← ventas [${used.join(", ")}] = ${fmt(cum).padStart(12)}  ${ok ? "✔ CUADRA" : "✘"}`,
  );
}
const restantes = days.slice(ptr);
if (restantes.length)
  console.log(`   días de venta sin depósito aún: ${restantes.map(([d, v]) => `${d.slice(5)} ${fmt(v)}`).join(", ")}`);
else console.log("   ✔ TODOS los días de venta 16→27-may quedaron consignados.");
