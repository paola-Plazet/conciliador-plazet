// Verificación del reporte: lee el Excel generado y recuadra todos los
// subtotales contra las cifras validadas en los cruces anteriores.
import * as XLSX from "xlsx";

const wb = XLSX.readFile(
  "C:/Users/Paola Agreda/OneDrive/Escritorio/PROYECTOS PAO/Cruce Habbie - Natural Light.xlsx",
);
const fmt = (n: number) => "$" + Math.round(n).toLocaleString("es-CO");
const ok = (cond: boolean) => (cond ? "✔" : "✘ ERROR");

// Esperados (validados en nl-plink-cruce.ts / nl-cruce-cuentas.ts / dato de Paola)
const ESP_TARJ: Record<string, number> = {
  "Unicentro Norte": 7662600,
  Unioccidente: 8396700,
  "Plaza de las Américas": 10889721,
  "Jardín Plaza": 490900,
};
const ESP_PRE: Record<string, number> = {
  "Unicentro Norte": 5262745,
  Unioccidente: 4494000,
  "Plaza de las Américas": 5122827,
};

console.log("== Hoja 'Detalle tarjetas' ==");
const t: any[][] = XLSX.utils.sheet_to_json(wb.Sheets["Detalle tarjetas"], { header: 1 });
let sumaFilas = 0, sumaH = 0, sumaVenta = 0, nDias = 0;
for (const r of t) {
  const c0 = String(r?.[0] ?? "");
  if (c0.startsWith("SUBTOTAL ")) {
    const tienda = c0.replace("SUBTOTAL ", "");
    const esp = ESP_TARJ[tienda];
    console.log(`   ${c0}: venta ${fmt(r[2])}, Habbie ${fmt(r[3])}, NL ${fmt(r[4])} ${ok(r[4] === esp)} (esperado ${fmt(esp)})`);
    // verificar que el subtotal = suma de sus filas
    console.log(`      suma de filas: venta ${fmt(sumaVenta)} ${ok(sumaVenta === r[2])}, NL ${fmt(sumaFilas)} ${ok(sumaFilas === r[4])}, días listados ${nDias}`);
    sumaFilas = 0; sumaH = 0; sumaVenta = 0; nDias = 0;
  } else if (typeof r?.[4] === "number" && typeof r?.[2] === "number" && r?.[1]) {
    sumaVenta += r[2]; sumaH += r[3]; sumaFilas += r[4]; nDias++;
    if (Math.round(r[2]) !== Math.round(r[3] + r[4]))
      console.log(`   ✘ fila ${r[0]} ${r[1]}: venta ≠ Habbie+NL`);
  } else if (c0.startsWith("TOTAL")) {
    console.log(`   ${c0}: ${fmt(r[4])} ${ok(r[4] === 27439921)}`);
  }
}

console.log("\n== Hoja 'Detalle efectivo' ==");
const e: any[][] = XLSX.utils.sheet_to_json(wb.Sheets["Detalle efectivo"], { header: 1 });
let suma = 0, n = 0;
for (const r of e) {
  const c0 = String(r?.[0] ?? "");
  if (c0.startsWith("SUBTOTAL ") && ESP_PRE[c0.replace("SUBTOTAL ", "")] != null) {
    const esp = ESP_PRE[c0.replace("SUBTOTAL ", "")];
    console.log(`   ${c0}: ${fmt(r[4])} ${ok(r[4] === esp && suma === r[4])} (esperado ${fmt(esp)}, suma filas ${fmt(suma)}, ${n} consigs)`);
    suma = 0; n = 0;
  } else if (c0 === "SUBTOTAL ventas pre-corte") {
    console.log(`   ${c0}: ${fmt(r[4])} ${ok(r[4] === 14879572)}`);
  } else if (c0 === "SUBTOTAL tiendas cerradas") {
    console.log(`   ${c0}: ${fmt(r[4])} ${ok(r[4] === 15154680)}`);
  } else if (typeof r?.[4] === "number" && r?.[1] && !c0.startsWith("SUBTOTAL")) {
    if (String(r[1]).match(/^\d{4}-/)) { suma += r[4]; n++; }
  }
}

console.log("\n== Hoja 'Resumen' ==");
const s: any[][] = XLSX.utils.sheet_to_json(wb.Sheets["Resumen"], { header: 1 });
for (const r of s) {
  const c0 = String(r?.[0] ?? "");
  if (c0.includes("SUBTOTAL a favor de Habbie")) console.log(`   ${c0.trim()}: ${fmt(r[1])} ${ok(r[1] === 27439921)}`);
  if (c0.includes("SUBTOTAL a favor de Natural")) console.log(`   ${c0.trim()}: ${fmt(r[1])} ${ok(r[1] === 30034252)}`);
  if (c0.includes("SUBTOTAL girado")) console.log(`   ${c0.trim()}: ${fmt(r[1])} ${ok(r[1] === 32976384)}`);
  if (c0.startsWith("SALDO NETO")) console.log(`   ${c0.trim()}: ${fmt(r[1])} ${ok(r[1] === 27439921 - 30034252 - 32976384)}`);
  if (c0.startsWith("RESULTADO")) console.log(`   ${c0.trim()}`);
}
// coherencia interna del resumen: suma de renglones = subtotales
const val = (txt: string) => s.find((r) => String(r?.[0] ?? "").trim().startsWith(txt))?.[1] ?? 0;
const sumaB = val("Unicentro Norte (16") + val("Unioccidente (16") + val("Plaza de las Américas (16") + val("Jardín Plaza (18");
console.log(`   suma renglones tarjetas = ${fmt(sumaB)} ${ok(sumaB === 27439921)}`);
const sumaA =
  val("Ventas pre-corte Unicentro Norte") + val("Ventas pre-corte Unioccidente") +
  val("Ventas pre-corte Plaza de las Américas") + val("Éxito San Pedro") +
  val("Éxito Sabana") + val("Unicentro Cali") + val("Éxito Occidente") + val("Viva Envigado");
console.log(`   suma renglones efectivo = ${fmt(sumaA)} ${ok(sumaA === 30034252)}`);
