// CRUCE DE CUENTAS CON NATURAL LIGHT
// Regla acordada: todo es de Paola desde el 16-abr (Jardín Plaza D0 desde el
// 16-may). Lo anterior a esas fechas y TODO lo de tiendas cerradas es de NL.
//
// A. Paola le debe a NL: efectivo que entró a su cuenta por ventas pre-corte
//    de sus tiendas + todo el efectivo de tiendas cerradas (incluida la
//    devolución de la cuenta de Éxito Occidente).
// B. NL le debe a Paola: ventas con tarjeta (TAR) de sus tiendas desde el
//    corte, facturadas por Linux (datafonos de NL).
// R. NL ya devolvió: transferencias "TI DEL ENCARGO ... NATURAL LIGHT".
// Neto = B - A - R  (positivo → NL le debe a Paola).
import * as XLSX from "xlsx";

const DIR =
  "C:/Users/Paola Agreda/OneDrive/Escritorio/PROYECTOS PAO/muestras-conciliacion/sistemas anteriores";
const MI_CUENTA = "100300399792";

const CORTE: Record<string, string> = {
  BQ: "2026-04-16",
  Q9: "2026-04-16",
  BD: "2026-04-16",
  D0: "2026-05-16",
};
const CERRADAS = new Set(["BB", "BC", "BF", "BJ", "BM"]);
const NOMBRE: Record<string, string> = {
  BQ: "Unicentro Norte",
  Q9: "Unioccidente",
  BD: "Plaza de las Américas",
  D0: "Jardín Plaza",
  BB: "Éxito Occidente",
  BC: "Viva Envigado",
  BF: "Éxito Sabana",
  BJ: "Éxito San Pedro",
  BM: "Unicentro Cali",
};

const fmt = (n: number) => "$" + Math.round(n).toLocaleString("es-CO");
const toDate = (v: any): string =>
  typeof v === "number"
    ? new Date(Date.UTC(1899, 11, 30) + v * 86400000).toISOString().slice(0, 10)
    : String(v ?? "").trim();

// ── Ventas Linux ─────────────────────────────────────────────────────────
const vWb = XLSX.readFile(`${DIR}/ventaSabmyju.xlsx`);
const ventas: any[] = XLSX.utils.sheet_to_json(vWb.Sheets["ventaSabmyju"]);
// EFE/TAR por tienda y día
const efe = new Map<string, Map<string, number>>();
const tar = new Map<string, Map<string, number>>();
for (const r of ventas) {
  const suc = String(r.SUC ?? "").trim();
  const d = toDate(r.FECHA);
  if (!suc || !d) continue;
  for (const [col, map] of [
    ["EFE", efe],
    ["TAR", tar],
  ] as const) {
    const v = Number(r[col] ?? 0);
    if (!v) continue;
    const m = map.get(suc) ?? new Map();
    m.set(d, (m.get(d) ?? 0) + v);
    map.set(suc, m);
  }
}

// ── Consignaciones Linux ─────────────────────────────────────────────────
const cWb = XLSX.readFile(`${DIR}/consignaciones linux.xlsx`);
const consigs: any[] = XLSX.utils.sheet_to_json(cWb.Sheets["consign"]);
interface Consig {
  suc: string;
  fecVenta: string;
  fecConsig: string;
  vlr: number;
  cuenta: string;
}
const cons: Consig[] = consigs
  .map((r) => {
    const keys = Object.keys(r);
    const get = (pat: RegExp) => {
      const k = keys.find((k) => pat.test(k));
      return k ? r[k] : undefined;
    };
    return {
      suc: String(get(/^SU$/i) ?? "").trim(),
      fecVenta: toDate(get(/VENTA/i)),
      fecConsig: toDate(get(/CONSIG/i)),
      vlr: Number(get(/VLR/i) ?? 0),
      cuenta: String(get(/CUENTA/i) ?? "").trim(),
    };
  })
  .filter((c) => c.suc && c.vlr);

// ── Banco (ALIANZA EFECTIVO) ─────────────────────────────────────────────
const bWb = XLSX.readFile(
  "C:/Users/Paola Agreda/OneDrive/Escritorio/conciliacion.xlsx",
);
const bRows: any[] = XLSX.utils.sheet_to_json(bWb.Sheets["ALIANZA EFECTIVO"]);
interface BankMov {
  date: string;
  concepto: string;
  valor: number;
  ref: string | null;
}
const bank: BankMov[] = bRows.map((r) => {
  const concepto = String(r["Concepto"] ?? "");
  const m = concepto.match(/RECAUDO REFE:\s*(\d+)/);
  return {
    date: toDate(r["Fecha Tran"]),
    concepto,
    valor: Number(r["Valor"] ?? 0),
    ref: m ? String(Number(m[1])) : null,
  };
});

// ══════════════════════════════════════════════════════════════════════
// A. EFECTIVO QUE LE CORRESPONDE A NATURAL LIGHT
// ══════════════════════════════════════════════════════════════════════
console.log("═".repeat(74));
console.log("A. EFECTIVO QUE ENTRÓ A LA CUENTA DE PAOLA Y ES DE NATURAL LIGHT");
console.log("═".repeat(74));

// A1. Tiendas de Paola: consignaciones a su cuenta por ventas ANTES del corte
console.log("\nA1. Tiendas de Paola — ventas ANTERIORES al corte, consignadas a su cuenta:");
let a1 = 0;
for (const suc of Object.keys(CORTE)) {
  const rows = cons.filter(
    (c) => c.suc === suc && c.cuenta === MI_CUENTA && c.fecVenta < CORTE[suc],
  );
  const sum = rows.reduce((s, c) => s + c.vlr, 0);
  if (!rows.length) continue;
  a1 += sum;
  const dates = rows.map((c) => c.fecVenta).sort();
  console.log(
    `   ${NOMBRE[suc].padEnd(24)} ${String(rows.length).padStart(3)} consig.  ventas ${dates[0]} → ${dates[dates.length - 1]}  ${fmt(sum).padStart(14)}`,
  );
}
console.log(`   ${"SUBTOTAL A1".padEnd(24)} ${" ".repeat(40)}${fmt(a1).padStart(14)}`);

// A2. Tiendas cerradas: TODO lo consignado a la cuenta de Paola (según archivo)
console.log("\nA2. Tiendas cerradas — todo lo consignado a la cuenta de Paola (archivo Linux):");
let a2file = 0;
for (const suc of CERRADAS) {
  const rows = cons.filter((c) => c.suc === suc && c.cuenta === MI_CUENTA);
  const sum = rows.reduce((s, c) => s + c.vlr, 0);
  a2file += sum;
  console.log(
    `   ${NOMBRE[suc].padEnd(24)} ${String(rows.length).padStart(3)} consig.  ${fmt(sum).padStart(14)}`,
  );
}
console.log(`   ${"SUBTOTAL A2 (archivo)".padEnd(24)} ${" ".repeat(15)}${fmt(a2file).padStart(14)}`);

// A2 verificado contra banco: referencias de tiendas cerradas realmente recibidas
console.log("\nA2-banco. Lo que REALMENTE llegó al banco por tiendas cerradas:");
const refCerradas: [string, string][] = [
  ["3111234598", "BJ"],
  ["3203518392", "BF"],
  ["3165476343", "BM"],
];
let a2bank = 0;
for (const [ref, suc] of refCerradas) {
  const movs = bank.filter((b) => b.ref === ref);
  const sum = movs.reduce((s, b) => s + b.valor, 0);
  a2bank += sum;
  console.log(
    `   ref ${ref} → ${NOMBRE[suc].padEnd(20)} ${String(movs.length).padStart(3)} movs  ${fmt(sum).padStart(14)}`,
  );
}
// 3172560775 antes del 16-may = Unicentro Cali (después es Jardín Plaza)
const caliMovs = bank.filter((b) => b.ref === "3172560775" && b.date < "2026-05-16");
const caliSum = caliMovs.reduce((s, b) => s + b.valor, 0);
a2bank += caliSum;
console.log(
  `   ref 3172560775 <16-may → ${NOMBRE.BM.padEnd(20)} ${String(caliMovs.length).padStart(2)} movs  ${fmt(caliSum).padStart(14)}`,
);
// Devolución cuenta Éxito Occidente
const bbMovs = bank.filter((b) => b.ref === "10030039979");
const bbSum = bbMovs.reduce((s, b) => s + b.valor, 0);
a2bank += bbSum;
console.log(
  `   ref 10030039979 (devol. cta Éxito Occ) → ${NOMBRE.BB.padEnd(6)} ${String(bbMovs.length).padStart(2)} movs  ${fmt(bbSum).padStart(14)}`,
);
console.log(`   ${"SUBTOTAL A2 (banco)".padEnd(24)} ${" ".repeat(15)}${fmt(a2bank).padStart(14)}`);
console.log(
  `   (diferencia archivo vs banco: ${fmt(a2file + 3842765 - a2bank)} — incluye Viva Envigado` +
    ` $945.715 y Éxito Sabana $64.450 que nunca llegaron, y consig. de BB a su propia cuenta)`,
);

// OJO: el banco arranca el 7-abr. Consignaciones a MI cuenta con fecha de
// consignación anterior al 7-abr no se pueden verificar contra extracto.
const preBanco = cons.filter((c) => c.cuenta === MI_CUENTA && c.fecConsig < "2026-04-07");
const preBancoSum = preBanco.reduce((s, c) => s + c.vlr, 0);
console.log(
  `   (consignaciones a la cuenta de Paola ANTES del 7-abr, no verificables: ${preBanco.length} por ${fmt(preBancoSum)})`,
);

const A = a1 + a2bank;
console.log(`\n   >>> TOTAL A (Paola le debe a NL) = A1 + A2-banco = ${fmt(A)}`);

// ══════════════════════════════════════════════════════════════════════
// B. TARJETAS DE LAS TIENDAS DE PAOLA DESDE EL CORTE (recaudó NL)
// ══════════════════════════════════════════════════════════════════════
console.log("\n" + "═".repeat(74));
console.log("B. TARJETAS (TAR) DE TIENDAS DE PAOLA DESDE EL CORTE — recaudadas por NL");
console.log("═".repeat(74));
let B = 0;
for (const suc of Object.keys(CORTE)) {
  const m = tar.get(suc) ?? new Map<string, number>();
  const days = [...m.entries()].filter(([d]) => d >= CORTE[suc]).sort();
  const sum = days.reduce((s, [, v]) => s + v, 0);
  B += sum;
  const first = days[0]?.[0] ?? "-";
  const last = days[days.length - 1]?.[0] ?? "-";
  console.log(
    `   ${NOMBRE[suc].padEnd(24)} TAR ${first} → ${last} (${days.length} días)  ${fmt(sum).padStart(14)}`,
  );
}
console.log(`\n   >>> TOTAL B (NL le debe a Paola por tarjetas) = ${fmt(B)}`);

// Referencia: tarjetas ANTES del corte y de tiendas cerradas (son de NL, no entran)
let tarNL = 0;
for (const [suc, m] of tar) {
  for (const [d, v] of m) {
    const corte = CORTE[suc];
    if (!corte || d < corte) tarNL += v;
  }
}
console.log(`   (referencia: TAR pre-corte + tiendas cerradas = ${fmt(tarNL)} — es de NL, no entra)`);

// ══════════════════════════════════════════════════════════════════════
// R. DEVOLUCIONES DE NL YA RECIBIDAS EN EL BANCO
// ══════════════════════════════════════════════════════════════════════
console.log("\n" + "═".repeat(74));
console.log("R. TRANSFERENCIAS DE NATURAL LIGHT YA RECIBIDAS");
console.log("═".repeat(74));
let R = 0;
for (const b of bank.filter((b) => /NATURAL LIGHT/i.test(b.concepto))) {
  R += b.valor;
  console.log(`   ${b.date}  ${fmt(b.valor).padStart(14)}`);
}
console.log(`   >>> TOTAL R recibido de NL = ${fmt(R)}`);

// ══════════════════════════════════════════════════════════════════════
// C. JARDÍN PLAZA 16→27-may: ¿consignaron completo el efectivo?
// ══════════════════════════════════════════════════════════════════════
console.log("\n" + "═".repeat(74));
console.log("C. JARDÍN PLAZA 16→27-may — efectivo vendido vs consignado vs banco");
console.log("═".repeat(74));
const jpEfe = [...(efe.get("D0") ?? new Map()).entries()]
  .filter(([d]) => d >= "2026-05-16")
  .sort();
const jpEfeSum = jpEfe.reduce((s, [, v]) => s + v, 0);
console.log(`   Venta EFE según Linux 16→27-may: ${fmt(jpEfeSum)}`);
for (const [d, v] of jpEfe) console.log(`      ${d}  ${fmt(v).padStart(12)}`);
const jpCons = cons.filter(
  (c) => c.suc === "D0" && c.fecVenta >= "2026-05-16" && c.cuenta === MI_CUENTA,
);
const jpConsSum = jpCons.reduce((s, c) => s + c.vlr, 0);
console.log(`   Consignado a cuenta Paola (archivo): ${fmt(jpConsSum)}`);
const jpBank = bank.filter(
  (b) => b.ref === "3172560775" && b.date >= "2026-05-16" && b.date <= "2026-06-05",
);
const jpBankSum = jpBank.reduce((s, b) => s + b.valor, 0);
console.log(`   Recibido en banco ref 3172560775 (16-may → 5-jun): ${fmt(jpBankSum)}`);
for (const b of jpBank) console.log(`      ${b.date}  ${fmt(b.valor).padStart(12)}`);
console.log(`   Diferencia venta vs banco: ${fmt(jpEfeSum - jpBankSum)}`);

// ══════════════════════════════════════════════════════════════════════
// SALDO NETO
// ══════════════════════════════════════════════════════════════════════
console.log("\n" + "═".repeat(74));
console.log("SALDO NETO DEL CRUCE");
console.log("═".repeat(74));
console.log(`   B  NL debe a Paola (tarjetas desde corte)   ${fmt(B).padStart(16)}`);
console.log(`   A  Paola debe a NL (efectivo pre-corte+cerradas) ${fmt(-A).padStart(11)}`);
console.log(`   R  Ya devuelto por NL                       ${fmt(-R).padStart(16)}`);
const neto = B - A - R;
console.log(`   ${"─".repeat(60)}`);
if (neto >= 0) console.log(`   >>> NATURAL LIGHT LE DEBE A PAOLA: ${fmt(neto)}`);
else console.log(`   >>> PAOLA LE DEBE A NATURAL LIGHT: ${fmt(-neto)}`);
