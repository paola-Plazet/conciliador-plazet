// LIMPIEZA 27-ago-2026 — revisión exhaustiva contra "movimientos bancos.xlsx"
//
//   npx tsx scripts/limpieza-27ago.ts --dry     → solo lectura: muestra qué haría
//   npx tsx scripts/limpieza-27ago.ts           → aplica en la BD (Neon) y recalcula
//
// Qué hace (en orden):
//  1. Referencia 3209052268 → Unicentro Norte (la usó hasta el 13-abr; calce día a día verificado).
//  2. Caso Mariana: 2 consignaciones de ago con ref de B3 que son de Plaza (también quedó en
//     REF_FIXES de banco.ts para que sobreviva a las recargas del extracto).
//  3. Borra las 12 facturas de Alegra de Unioccidente del 1-may (duplicadas con Linux).
//  4. Recarga Linux con los cortes nuevos (tarjeta desde que existe el datáfono de Habbie:
//     23-abr B3 / 24-abr B1-B2; Unioccidente en Linux hasta el 4-may).
//  5. QR: reemplaza 14–25 ago con el consolidado y agrega las transferencias de clientes
//     (TRANSFERENCIA CTA SUC VIRTUAL / CONSIGNACION CORRESPONSAL / PAGO DE PROV ≥ $20.000)
//     de todo el histórico — el parser del CSV 191 ya las lee igual.
//  6. Mercado Pago: inserta las operaciones del 25–26 ago que no estaban en el settlement.
//  7. Recalcula y ACEPTA con nota (Adjustment → MANUAL) todo lo que tiene explicación
//     verificada; lo que no, queda pendiente y se lista al final.
import fs from "node:fs";
import * as XLSX from "xlsx";
import { prisma } from "../src/lib/db";
import { ingestFiles, computeLedger } from "../src/lib/ledger";
import { conciliar } from "../src/lib/engine";
import { parseLinux } from "../src/lib/parsers/linux";
import { storeName } from "../src/lib/stores";
import type { ConciliationResult } from "../src/lib/types";

const DRY = process.argv.includes("--dry");
const XLSX_BANCOS = "C:/Users/Paola Agreda/OneDrive/Escritorio/HABBIE/PLAZET/MOVIMIENTOS BANCOS/movimientos bancos.xlsx";
const LINUX = "C:/Users/Paola Agreda/OneDrive/Escritorio/PROYECTOS PAO/muestras-conciliacion/sistemas anteriores/ventaSabmyju.xlsx";
const fmt = (n: number) => "$" + Math.round(n).toLocaleString("es-CO");
const d10 = (v: unknown) => (v instanceof Date ? new Date(v.getTime() + 12 * 3600e3).toISOString().slice(0, 10) : String(v).slice(0, 10));

// ───────────── fuentes externas ─────────────
function leerConsolidado() {
  const wb = XLSX.readFile(XLSX_BANCOS, { cellDates: true });
  const bc = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets["mov bancolombia"], { header: 1, raw: true, defval: null })
    .slice(1)
    .filter((r) => r[1] && typeof r[2] === "number")
    .map((r) => ({ date: d10(r[1]), amount: r[2] as number, concept: String(r[4] ?? "") }));
  const esQr = (c: string) => /^PAGO (QR|LLAVE)/i.test(c);
  const esTransfCliente = (c: string, a: number) =>
    a >= 20000 && !/CREDICORP/i.test(c) && /^(TRANSFERENCIA CTA SUC VIRTUAL|CONSIGNACION CORRESPONSAL|PAGO DE PROV)/i.test(c);
  const qr = bc
    .filter((r) => r.amount > 0 && (esQr(r.concept) || esTransfCliente(r.concept, r.amount)))
    .map((r) => ({ date: r.date, concept: r.concept, amount: r.amount, payer: r.concept.replace(/^PAGO (QR|LLAVE)\s*/i, "").trim() }));
  const mpRows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets["mov mercadopago"], { header: 1, raw: true, defval: null })
    .slice(1)
    .filter((r) => r[0] && typeof r[2] === "number" && /PAGO APROBADO/.test(String(r[1])));
  const MEDIO: Record<string, string> = { "TRANSFERENCIA BANCARIA": "Transferencia bancaria", "TARJETA DE CRÉDITO": "Tarjeta de crédito", "TARJETA DE DÉBITO": "Tarjeta de débito", "CUPÓN DE PAGO": "Cupón de pago", AVAILABLE_MONEY: "available_money" };
  const mp = mpRows.map((r) => {
    const c = String(r[1]);
    const med = (c.match(/PAGO APROBADO - (.+?) - ID/) || [])[1] ?? "";
    return { date: d10(r[0]), opId: (c.match(/ID (\d+)/) || [])[1] ?? "", medio: MEDIO[med] ?? med, bruto: r[2] as number, neto: r[5] as number, release: null as string | null };
  });
  return { qr, mp };
}

// ───────────── reglas de aceptación ─────────────
interface Aj { resultId: string; salesDates: string[]; note: string }
const NL = "(cruce con Natural Light, hoja «Abril día a día»)";

function reglas(res: ConciliationResult[]): { ajustes: Aj[]; pendientes: ConciliationResult[] } {
  const pend = res.filter((r) => r.status === "DIFERENCIA" || r.status === "SIN_CONCILIAR");
  const done = new Map<string, Aj>();
  const acepta = (r: ConciliationResult, note: string, salesDates = r.salesDates) => { if (!done.has(r.id)) done.set(r.id, { resultId: r.id, salesDates, note }); };
  const byId = new Map(pend.map((r) => [r.id, r]));
  const dias = (r: ConciliationResult) => (r.salesDates.length ? [...r.salesDates].sort() : [r.depositDate]);
  const dist = (a: ConciliationResult, b: ConciliationResult) => { const da = dias(a), db = dias(b); const ms = Math.min(...da.map((x) => Math.min(...db.map((y) => Math.abs(Date.parse(x) - Date.parse(y)))))); return ms / 864e5; };

  // R1 · abril: consignaciones de tiendas cerradas de NL y días que fueron a NL
  for (const r of pend) {
    if (r.channel !== "EFECTIVO") continue;
    if (r.id.startsWith("EFECTIVO:?:2026-04-")) acepta(r, `Consignación de tienda(s) cerrada(s) de Natural Light — Éxito Occidente / Sabana / San Pedro / U. Cali ${NL}`, []);
    if (r.id.startsWith("EFECTIVO:JP:2026-04-") || r.id === "EFECTIVO:JP:2026-05-04") acepta(r, `Unicentro Cali (NL) usó la referencia 3172560775 en abril; Jardín Plaza la retomó en mayo ${NL}`, []);
  }
  const e = (id: string) => byId.get(id);
  let x: ConciliationResult | undefined;
  if ((x = e("EFECTIVO:B1:2026-04-08"))) acepta(x, `Efectivo del 1 al 5-abr se consignó a Natural Light (pre-corte); el depósito cubre 6+7-abr ${NL}`, ["2026-04-06", "2026-04-07"]);
  if ((x = e("EFECTIVO:B2:2026-04-07"))) acepta(x, `Efectivo del 1 al 5-abr se consignó a Natural Light (pre-corte); el depósito cubre el 6-abr ${NL}`, ["2026-04-06"]);
  if ((x = e("EFECTIVO:B3:2026-04-08"))) acepta(x, `Efectivo del 1-abr se consignó a Natural Light; el depósito (ref 3209052268) cubre 2 al 6-abr ${NL}`, ["2026-04-02", "2026-04-03", "2026-04-04", "2026-04-05", "2026-04-06"]);
  if ((x = e("EFECTIVO:B3:2026-04-09"))) acepta(x, `Depósito ref 3209052268 = venta del 7-abr ${NL}`, ["2026-04-07"]);
  if ((x = e("EFECTIVO:B1:2026-04-17"))) acepta(x, "Consignaron $50.000 de más el 17-abr y $50.012 de menos el 20-abr (neto $12) — se compensan");
  if ((x = e("EFECTIVO:B1:2026-04-20"))) acepta(x, "Consignaron $50.000 de más el 17-abr y $50.012 de menos el 20-abr (neto $12) — se compensan");
  // R2 · abril: transición del datáfono (parte del día pasó por el terminal de NL)
  for (const id of ["DATAFONO:B1:2026-04-24", "DATAFONO:B2:2026-04-24", "DATAFONO:B2:2026-04-25", "DATAFONO:B3:2026-04-23"])
    if ((x = e(id))) acepta(x, `Transición: parte del datáfono de ese día pasó por el terminal de Natural Light; Habbie recibió solo ${fmt(x.depositAmount)} ${NL}`);
  for (const id of ["DATAFONO:B2:2026-04-30", "DATAFONO:B3:2026-04-29"])
    if ((x = e(id))) acepta(x, `Transición Linux→Alegra: el datáfono de Habbie recibió ${fmt(x.difference)} más que lo facturado ese día`);
  // R8 · la "venta" de $10,9M en ubicación nl (fac 2574) no es venta de tienda
  if ((x = e("EFECTIVO:?:2026-08-05"))) acepta(x, "Consignación $105.050 ref 31483657 (referencia de tienda cerrada NL). La 'venta' fac 2574 de $10.938.389 en ubicación 'nl' (27-jul) no es efectivo de tienda — REVISAR qué es", []);
  // Otros conocidos
  if ((x = e("DATAFONO:JP:2026-05-27"))) acepta(x, "Venta de $199.650 registrada en Linux como Nequi/otro medio pero cobrada en el datáfono de Habbie");
  if ((x = e("DATAFONO:B3:2026-07-02"))) acepta(x, "fac 7544 $97.200 vs datáfono $92.700: digitaron $4.500 de menos en el datáfono (25-jul)");
  if ((x = e("QR:ALL:2026-07-01"))) acepta(x, "2 pagos QR de SANDRA MILENA por $132.000 c/u fueron reversados el 2-jul (REV PAGO QR BANCOL) — neto $0");
  if ((x = e("QR:ALL:2026-07-04"))) acepta(x, "Pago QR NUBIA $63.600 sin venta en el POS (sobra, conocido desde 25-jul)");
  if ((x = e("QR:ALL:2026-05-01"))) acepta(x, "1-may: Plaza y Unioccidente aún facturaban en Linux (sin desglose de QR Bancolombia) — no comparable");
  if ((x = e("QR:ALL:2026-05-05"))) acepta(x, "5-may: Plaza aún facturaba en Linux (sin desglose de QR Bancolombia) — no comparable");
  if ((x = e("EFECTIVO:B2:2026-05-05"))) acepta(x, "Depósito = efectivo del 4-may (último día de Unioccidente en Linux)");

  if ((x = e("EFECTIVO:B2:2026-04-15:2"))) acepta(x, `Efectivo de Éxito Occidente (NL) del 12, 13 y 14-abr ($301.750 + $187.200 + $371.900 = $860.850) consignado con la referencia de Unioccidente ${NL}`, []);

  // R5 · sobras del canal QR que son plata de una tienda que entró por QR/transferencia:
  //      grupos de 1–3 días QR con sobra ↔ faltantes de efectivo/datáfono (solos o el neto de
  //      dos resultados de la misma tienda/canal), con tolerancia ±$1.000 y ≤ 6 días de distancia.
  const libres = () => pend.filter((r) => !done.has(r.id) && !/2026-08-26$/.test(r.id) && !(r.note ?? "").includes("fuera del rango"));
  type Cand = { ids: string[]; rows: ConciliationResult[]; v: number; txt: string };
  const cruzarQR = (tol: number) => {
    const qrS = libres().filter((r) => r.channel === "QR" && r.difference > 0).sort((a, b) => a.depositDate.localeCompare(b.depositDate));
    const grupos: ConciliationResult[][] = [];
    for (let i = 0; i < qrS.length; i++) for (let n = 1; n <= 3; n++) { const g = qrS.slice(i, i + n); if (g.length === n && (n === 1 || dist(g[0], g[n - 1]) <= 4)) grupos.push(g); }
    grupos.sort((a, b) => a.length - b.length || a[0].depositDate.localeCompare(b[0].depositDate));
    const cands = (): Cand[] => {
      const st = libres().filter((r) => r.channel !== "QR");
      const out: Cand[] = st.filter((r) => r.difference < -1500).map((r) => ({ ids: [r.id], rows: [r], v: -r.difference, txt: `${storeName(r.storeCode)} ${r.channel.toLowerCase()} ${fmt(-r.difference)} (${r.id.slice(-10)})` }));
      for (const a of st) for (const b of st) if (a.id < b.id && a.storeCode === b.storeCode && a.channel === b.channel && dist(a, b) <= 3 && a.difference + b.difference < -1500 && Math.sign(a.difference) !== Math.sign(b.difference))
        out.push({ ids: [a.id, b.id], rows: [a, b], v: -(a.difference + b.difference), txt: `${storeName(a.storeCode)} ${a.channel.toLowerCase()} neto ${fmt(-(a.difference + b.difference))} (${a.id.slice(-10)} y ${b.id.slice(-10)})` });
      return out;
    };
    for (const g of grupos) {
      if (g.some((q) => done.has(q.id))) continue;
      const total = g.reduce((s, q) => s + q.difference, 0);
      // cerca en el tiempo y NUNCA antes de la venta (la plata no llega antes de venderse)
      // (con 3 días de holgura: el cliente paga el sábado y la factura sale el lunes)
      const desde = (r: ConciliationResult) => { const d0 = r.salesDates.length ? [...r.salesDates].sort()[0] : r.depositDate; return new Date(Date.parse(d0) - 3 * 864e5).toISOString().slice(0, 10); };
      const cs = cands().filter((c) => c.rows.every((r) => Math.min(...g.map((q) => dist(r, q))) <= 6 && g[g.length - 1].depositDate >= desde(r)));
      const ok = (arr: Cand[]) => Math.abs(arr.reduce((s, c) => s + c.v, 0) - total) <= tol && new Set(arr.flatMap((c) => c.ids)).size === arr.flatMap((c) => c.ids).length && (arr.length === 1 || arr.every((c) => c.v >= 5000));
      let best: Cand[] | null = null;
      // primero todos los solos, luego pares, luego tríos (evita rellenar con montos chicos)
      for (const c of cs) if (!best && ok([c])) best = [c];
      for (let i = 0; i < cs.length && !best; i++) for (let j = i + 1; j < cs.length && !best; j++) if (ok([cs[i], cs[j]])) best = [cs[i], cs[j]];
      for (let i = 0; i < cs.length && !best; i++) for (let j = i + 1; j < cs.length && !best; j++) for (let k = j + 1; k < cs.length && !best; k++) if (ok([cs[i], cs[j], cs[k]])) best = [cs[i], cs[j], cs[k]];
      if (!best) continue;
      const qids = g.map((q) => q.id.slice(-10)).join("+");
      for (const q of g) acepta(q, `Sobra QR (${qids}) = plata que entró por QR/transferencia en vez de ${best.map((c) => c.txt).join(" + ")}`);
      for (const c of best) for (const r of c.rows) acepta(r, `${r.qrAlert && r.note ? r.note + " · " : ""}El faltante entró a la cuenta del datáfono como pago QR/transferencia (ver QR ${qids})`);
    }
  };
  cruzarQR(150); // calce casi exacto primero

  // R4 · pares que se compensan (misma tienda, ±6 días, residuo ≤ $1.500): mismo o distinto canal
  for (const a of libres()) {
    if (done.has(a.id)) continue;
    const cands = libres().filter((b) => b.id !== a.id && (b.storeCode ?? "ALL") === (a.storeCode ?? "ALL") && Math.abs(a.difference + b.difference) <= 1500 && dist(a, b) <= 6);
    if (!cands.length) continue;
    const b = cands.sort((p, q) => Math.abs(a.difference + p.difference) - Math.abs(a.difference + q.difference) || dist(a, p) - dist(a, q))[0];
    const cruzado = a.channel !== b.channel;
    const txt = cruzado
      ? `Se compensa con ${b.id}: venta registrada con el medio de pago cambiado (${a.channel.toLowerCase()}↔${b.channel.toLowerCase()}), neto ${fmt(a.difference + b.difference)}`
      : `Se compensa con ${b.id}: cobro y factura en días distintos, neto ${fmt(a.difference + b.difference)}`;
    acepta(a, txt); acepta(b, txt.replace(b.id, a.id));
  }
  cruzarQR(1000); // segundo pase QR con tolerancia (cliente pagó unos pesos de más/menos)
  // R3 · diferencias menores: efectivo ≤ $5.000 (sobrantes/faltantes de caja), datáfono/QR ≤ $1.500
  for (const r of libres()) {
    if (r.channel === "EFECTIVO" && Math.abs(r.difference) <= 5000) acepta(r, `Diferencia menor de caja (${fmt(r.difference)})`);
    else if (r.channel !== "EFECTIVO" && Math.abs(r.difference) <= 1500) acepta(r, `Diferencia menor (${fmt(r.difference)})`);
  }

  const pendientes = pend.filter((r) => !done.has(r.id));
  return { ajustes: [...done.values()], pendientes };
}

function imprimir(res: ConciliationResult[], titulo: string) {
  const byM: Record<string, Record<string, number>> = {};
  for (const r of res) { const m = r.month ?? r.depositDate.slice(0, 7); byM[m] = byM[m] ?? {}; byM[m][r.status] = (byM[m][r.status] ?? 0) + 1; }
  console.log(`\n${titulo}`);
  for (const [m, v] of Object.entries(byM).sort()) console.log(`  ${m}: cuadran ${v.CUADRA ?? 0} · manuales ${v.MANUAL ?? 0} · diferencias ${v.DIFERENCIA ?? 0} · sin conciliar ${v.SIN_CONCILIAR ?? 0}`);
}
function listar(rs: ConciliationResult[]) {
  for (const r of rs.sort((a, b) => (a.month ?? "").localeCompare(b.month ?? "") || a.channel.localeCompare(b.channel) || (a.storeCode ?? "").localeCompare(b.storeCode ?? "") || a.depositDate.localeCompare(b.depositDate))) {
    const ds = [...r.salesDates].sort();
    const rango = ds.length ? `${ds[0].slice(5)}${ds.length > 1 ? "…" + ds[ds.length - 1].slice(5) : ""}` : "-";
    console.log(`   ${r.id.padEnd(28)} ${storeName(r.storeCode).padEnd(21)} venta ${rango.padEnd(12)} ${fmt(r.salesAmount).padStart(12)} recaudo ${fmt(r.depositAmount).padStart(12)} dif ${fmt(r.difference).padStart(12)}${r.late ? " tardía" : ""} ${r.note ? "· " + r.note.slice(0, 80) : ""}`);
  }
}

// ───────────── main ─────────────
async function main() {
  const { qr: qrX, mp: mpX } = leerConsolidado();
  const linuxSales = parseLinux(fs.readFileSync(LINUX)).sales;
  console.log(`Modo: ${DRY ? "SOLO LECTURA (--dry)" : "APLICAR EN BD"}`);

  let res: ConciliationResult[];
  if (DRY) {
    const [salesRows, bankRows, qrRows, datRows, hol, refs] = await Promise.all([
      prisma.sale.findMany(), prisma.bankEntry.findMany(), prisma.qrEntry.findMany(), prisma.dataphoneEntry.findMany(), prisma.holiday.findMany(), prisma.cashReference.findMany({ include: { store: true } }),
    ]);
    const refMap = new Map(refs.map((r) => [r.reference, r.store.code])); refMap.set("3209052268", "B3");
    const bank = bankRows.map((b) => { let ref = b.reference; if (ref === "3138845101" && ((b.date === "2026-08-06" && b.amount === 402850) || (b.date === "2026-08-10" && b.amount === 1887650))) ref = "3102874360"; return { date: b.date, concept: b.concept, amount: b.amount, reference: ref, storeCode: ref ? refMap.get(ref) ?? null : null, kind: b.kind as "RECAUDO_EFECTIVO" }; });
    const sales = salesRows.filter((s) => s.source !== "linux" && !(s.source === "alegra" && s.storeCode === "B2" && s.date < "2026-05-05")).map((s) => ({ invoice: s.invoice, date: s.date, bodega: s.bodega, storeCode: s.storeCode, method: s.method as import("../src/lib/types").SaleInvoice["method"], amount: s.amount })).concat(linuxSales);
    const existQr = new Set(qrRows.map((q) => `${q.date}|${Math.round(q.amount)}|${q.concept}`));
    const qrBank = qrRows.filter((q) => q.date < "2026-08-14").map((q) => ({ date: q.date, concept: q.concept, amount: q.amount, payer: q.payer }))
      .concat(qrX.filter((q) => q.date >= "2026-08-14" && q.date <= "2026-08-25"))
      .concat(qrX.filter((q) => q.date < "2026-08-14" && !/^PAGO (QR|LLAVE)/i.test(q.concept) && !existQr.has(`${q.date}|${Math.round(q.amount)}|${q.concept}`)));
    const datafono = datRows.map((e) => ({ txDate: e.txDate, depositDate: e.depositDate, establishment: e.establishment, storeCode: e.storeCode, franchise: e.franchise, cardType: e.cardType, gross: e.gross, net: e.net, terminal: e.terminal }));
    res = conciliar({ sales, bank, datafono, qrBank, holidays: hol.map((h) => h.date), adjustments: [] }).results;
  } else {
    const b3 = await prisma.store.findUniqueOrThrow({ where: { code: "B3" } });
    await prisma.cashReference.upsert({ where: { reference: "3209052268" }, create: { reference: "3209052268", storeId: b3.id }, update: { storeId: b3.id } });
    console.log("1. CashReference 3209052268 → B3");
    for (const f of [{ date: "2026-08-06", amount: 402850 }, { date: "2026-08-10", amount: 1887650 }]) {
      const r = await prisma.bankEntry.updateMany({ where: { date: f.date, amount: f.amount, reference: "3138845101" }, data: { reference: "3102874360" } });
      console.log(`2. Mariana ${f.date} ${fmt(f.amount)}: ${r.count} fila(s) → ref de Plaza`);
    }
    const dup = await prisma.sale.deleteMany({ where: { source: "alegra", storeCode: "B2", date: { lt: "2026-05-05" } } });
    console.log(`3. Alegra Unioccidente < 5-may borradas: ${dup.count}`);
    const out = await ingestFiles([{ filename: "ventaSabmyju.xlsx", buffer: fs.readFileSync(LINUX) }]);
    console.log("4. Linux recargado:", JSON.stringify(out.files));
    const delQ = await prisma.qrEntry.deleteMany({ where: { date: { gte: "2026-08-14", lte: "2026-08-25" } } });
    const q1 = qrX.filter((q) => q.date >= "2026-08-14" && q.date <= "2026-08-25");
    await prisma.qrEntry.createMany({ data: q1 });
    const existQr = new Set((await prisma.qrEntry.findMany()).map((q) => `${q.date}|${Math.round(q.amount)}|${q.concept}`));
    const q2 = qrX.filter((q) => q.date < "2026-08-14" && !/^PAGO (QR|LLAVE)/i.test(q.concept) && !existQr.has(`${q.date}|${Math.round(q.amount)}|${q.concept}`));
    await prisma.qrEntry.createMany({ data: q2 });
    console.log(`5. QR: 14–25 ago borradas ${delQ.count} / insertadas ${q1.length}; transferencias de clientes históricas agregadas ${q2.length}: ${q2.map((q) => q.date.slice(5) + " " + fmt(q.amount)).join(", ")}`);
    await prisma.upload.create({ data: { filename: "movimientos bancos.xlsx (mov bancolombia: QR/LLAVE 14–25 ago + transferencias de clientes)", kind: "datafono_banco", dateFrom: "2026-05-01", dateTo: "2026-08-25", rows: q1.length + q2.length } });
    const existMp = new Set((await prisma.mercadopagoEntry.findMany({ select: { opId: true } })).map((m) => m.opId));
    const nuevos = mpX.filter((m) => m.opId && !existMp.has(m.opId) && m.date >= "2026-08-01");
    await prisma.mercadopagoEntry.createMany({ data: nuevos });
    console.log(`6. Mercado Pago insertadas ${nuevos.length}: ${nuevos.map((m) => m.date.slice(5) + " " + fmt(m.bruto)).join(", ")}`);
    await prisma.upload.create({ data: { filename: "movimientos bancos.xlsx (mov mercadopago 25–26 ago)", kind: "mercadopago", dateFrom: "2026-08-25", dateTo: "2026-08-26", rows: nuevos.length } });
    res = (await computeLedger()).summary.results;
  }

  imprimir(res, "ANTES de aceptar (con datos corregidos):");
  const { ajustes, pendientes } = reglas(res);
  console.log(`\n7. Ajustes con nota: ${ajustes.length}`);
  for (const a of ajustes) console.log(`   ✓ ${a.resultId.padEnd(28)} ${a.note.slice(0, 110)}`);

  if (!DRY) {
    for (const a of ajustes) await prisma.adjustment.upsert({ where: { resultId: a.resultId }, create: { resultId: a.resultId, salesDates: JSON.stringify(a.salesDates), note: a.note }, update: { salesDates: JSON.stringify(a.salesDates), note: a.note } });
    const fin = await computeLedger();
    imprimir(fin.summary.results, "DESPUÉS (estado final en la app):");
    console.log(`\nQUEDAN PENDIENTES (${pendientes.length}) — para revisar con Paola:`);
    listar(fin.summary.results.filter((r) => r.status === "DIFERENCIA" || r.status === "SIN_CONCILIAR"));
  } else {
    console.log(`\nQUEDARÍAN PENDIENTES (${pendientes.length}):`);
    listar(pendientes);
  }
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
