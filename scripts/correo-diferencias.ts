// Correo diario (9 am) a Jero con las diferencias de la conciliación de tiendas.
// Lo corre la tarea de Windows "Conciliador correo 9am" (robot-bancos/diario_9am.py)
// DESPUÉS de cargar las ventas de Karrot; los bancos ya los carga el robot cada hora.
//
//   npx tsx scripts/correo-diferencias.ts            → envía y marca como reportadas
//   npx tsx scripts/correo-diferencias.ts --prueba   → envía solo a SMTP_USER, sin marcar
//   npx tsx scripts/correo-diferencias.ts --html x   → escribe el HTML en x, no envía
//
// "Nuevas" = diferencias que no salieron en un correo anterior (data-correo/reportadas.json),
// así las que llegan con rezago (datáfono publica al día hábil siguiente) salen el día que
// aparecen. Abajo va el resumen de lo que sigue abierto del mes y el efectivo sin consignar.
import fs from "fs";
import path from "path";
import nodemailer from "nodemailer";
import { prisma } from "../src/lib/db";
import { computeLedger } from "../src/lib/ledger";
import { cruzarDatafono } from "../src/lib/datafono-cruce";
import type { ConciliationResult } from "../src/lib/types";

const APP = "https://conciliador-plazet.vercel.app";
const ESTADO = path.join(__dirname, "..", "data-correo", "reportadas.json");
const args = process.argv.slice(2);
const PRUEBA = args.includes("--prueba");
const HTML_OUT = args.includes("--html") ? args[args.indexOf("--html") + 1] : null;

const cop = (n: number) => (n < 0 ? "−" : "") + "$" + Math.round(Math.abs(n)).toLocaleString("es-CO");
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const DIAS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
const dia = (d: string) => {
  const [y, m, dd] = d.split("-").map(Number);
  return `${DIAS[new Date(y, m - 1, dd).getDay()]} ${dd}-${MESES[m - 1]}`;
};
// "NATALIA PATRICIA CERRA CANTERO" → "Natalia Cerra"
const nombreCorto = (n: string | null | undefined) => {
  if (!n) return "—";
  const w = n.trim().toLowerCase().split(/\s+/).map((x) => x.charAt(0).toUpperCase() + x.slice(1));
  return w.length >= 4 ? `${w[0]} ${w[2]}` : w.length === 3 ? `${w[0]} ${w[1]}` : w.join(" ");
};
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const CANAL: Record<string, string> = { EFECTIVO: "Efectivo", DATAFONO: "Datáfono", QR: "QR", CENTRO_COMERCIAL: "Centro comercial" };

function leerEstado(): Set<string> {
  try {
    return new Set(JSON.parse(fs.readFileSync(ESTADO, "utf8")) as string[]);
  } catch {
    return new Set();
  }
}

/** vendedoras con ventas en la tienda en esos días (opcionalmente de un método) */
async function vendedoras(store: string | null, dates: string[], methods?: string[]): Promise<string[]> {
  if (!store || dates.length === 0) return [];
  const rows = await prisma.sale.findMany({
    where: { storeCode: store, date: { in: dates }, vendedor: { not: null }, ...(methods ? { method: { in: methods } } : {}) },
    select: { vendedor: true },
    distinct: ["vendedor"],
  });
  return rows.map((r) => nombreCorto(r.vendedor)).sort();
}

/** Detalle transacción a transacción del datáfono (misma lógica que /api/datafono-dia) */
async function detalleDatafono(date: string, store: string): Promise<string[]> {
  const [ventas, trans] = await Promise.all([
    prisma.sale.findMany({
      where: { date, storeCode: store, method: { in: ["TARJETA_CREDITO", "TARJETA_DEBITO"] } },
      orderBy: [{ hora: "asc" }, { invoice: "asc" }, { id: "asc" }],
    }),
    prisma.dataphoneEntry.findMany({ where: { txDate: date, storeCode: store }, orderBy: { id: "asc" } }),
  ]);
  const posIn = ventas.map((v) => ({
    id: v.id, invoice: v.source === "karrot_devolucion" ? "devolución" : v.invoice, hora: v.hora,
    franquicia: v.franquicia, tipo: v.method === "TARJETA_CREDITO" ? "CR" : "DB", ultimos4: v.ultimos4,
    autorizacion: v.autorizacion, amount: v.amount, esDevolucion: v.source === "karrot_devolucion", vendedor: v.vendedor,
  }));
  const txIn = trans.map((t) => ({
    id: t.id, franchise: t.franchise, cardType: t.cardType, gross: t.gross, net: t.net,
    depositDate: t.depositDate, autorizacion: t.autorizacion, ultimos4: t.ultimos4,
  }));
  const cruce = cruzarDatafono(posIn, txIn);
  const par = new Map(cruce.pares.map((p) => [p.pos.id, p]));
  const out: string[] = [];
  for (const p of posIn) {
    const m = par.get(p.id);
    const quien = `<b>${esc(nombreCorto(p.vendedor))}</b>`;
    const fac = `factura ${esc(p.invoice)}${p.hora ? ` (${p.hora})` : ""}`;
    if (!m) out.push(`${quien} · ${fac} por ${cop(p.amount)} → <span style="color:#b91c1c">no está en el datáfono</span>`);
    else if (Math.abs(m.difValor) > 50) {
      const gross = m.tx.gross + (m.tx2?.gross ?? 0);
      out.push(`${quien} · ${fac}: facturó ${cop(p.amount)} y el datáfono cobró ${cop(gross)} (<span style="color:#b91c1c">${m.difValor > 0 ? "+" : ""}${cop(m.difValor)}</span>)`);
    }
  }
  if (cruce.txSueltas.length > 0) {
    const turno = await vendedoras(store, [date]);
    for (const t of cruce.txSueltas)
      out.push(`Cobro en el datáfono de ${cop(t.gross)}${t.autorizacion ? ` (aut. ${esc(t.autorizacion)})` : ""} <span style="color:#b45309">sin factura en Karrot</span>${turno.length ? ` · ese día vendieron: ${turno.map(esc).join(", ")}` : ""}`);
  }
  return out;
}

async function filaResultado(r: ConciliationResult): Promise<{ tienda: string; html: string; monto: number }> {
  const tienda = r.storeCode ? r.storeName : "Empresa (QR)";
  const fechas = r.salesDates.length ? r.salesDates : [r.depositDate];
  const fechaTxt = fechas.map(dia).join(", ");
  const monto = r.channel === "DATAFONO" ? (r.falta ?? 0) + (r.sobra ?? 0) || Math.abs(r.difference) : Math.abs(r.difference);
  let difTxt: string;
  if (r.channel === "DATAFONO" && (r.falta || r.sobra))
    difTxt = [r.falta ? `falta ${cop(r.falta)}` : "", r.sobra ? `sobra ${cop(r.sobra)}` : ""].filter(Boolean).join(" · ");
  else difTxt = r.difference < 0 ? `falta ${cop(-r.difference)}` : `sobra ${cop(r.difference)}`;

  const detalle: string[] = [];
  if (r.channel === "DATAFONO" && r.storeCode) detalle.push(...(await detalleDatafono(r.salesDates[0] ?? r.depositDate, r.storeCode)));
  else if (r.channel === "EFECTIVO") {
    if (r.status === "SIN_CONCILIAR" && r.salesAmount === 0)
      detalle.push(`Consignación de ${cop(r.depositAmount)} el ${dia(r.depositDate)} que no corresponde a ventas en efectivo pendientes`);
    else {
      detalle.push(`Vendido en efectivo ${cop(r.salesAmount)} · consignado ${cop(r.depositAmount)} el ${dia(r.depositDate)}`);
      const v = await vendedoras(r.storeCode, r.salesDates, ["EFECTIVO"]);
      if (v.length) detalle.push(`Vendieron en efectivo: <b>${v.map(esc).join(", ")}</b>`);
    }
    if (r.qrAlert && r.note) detalle.push(esc(r.note));
  } else {
    detalle.push(`Ventas ${cop(r.salesAmount)} · banco ${cop(r.depositAmount)}`);
    if (r.note) detalle.push(esc(r.note));
  }
  const html = `<tr>
<td style="padding:6px 8px;border-bottom:1px solid #eee;white-space:nowrap;vertical-align:top">${fechaTxt}</td>
<td style="padding:6px 8px;border-bottom:1px solid #eee;vertical-align:top">${CANAL[r.channel] ?? r.channel}</td>
<td style="padding:6px 8px;border-bottom:1px solid #eee;white-space:nowrap;vertical-align:top;font-weight:600;color:${difTxt.startsWith("falta") ? "#b91c1c" : "#b45309"}">${difTxt}</td>
<td style="padding:6px 8px;border-bottom:1px solid #eee;vertical-align:top;font-size:13px">${detalle.join("<br>")}</td></tr>`;
  return { tienda, html, monto };
}

async function main() {
  const l = await computeLedger();
  const cerrados = new Set(l.months.filter((m) => m.closed).map((m) => m.month));
  // solo lo reciente: lo anterior a 35 días ya se revisa por /meses, no por correo diario
  const desde = new Date(Date.now() - 35 * 86400000).toLocaleDateString("en-CA", { timeZone: "America/Bogota" });
  const abiertas = l.summary.results.filter(
    (r) =>
      (r.status === "DIFERENCIA" || r.status === "SIN_CONCILIAR") &&
      !cerrados.has(r.month ?? "") &&
      (r.salesDates[r.salesDates.length - 1] ?? r.depositDate) >= desde &&
      // huecos de archivo (fuente aún sin cargar ese día): no son diferencias
      !/fuera del rango|no comparable|faltan ventas previas/i.test(r.note ?? ""),
  );
  const reportadas = leerEstado();
  const nuevas = abiertas.filter((r) => !reportadas.has(r.id));
  const viejas = abiertas.filter((r) => reportadas.has(r.id));

  // nuevas, agrupadas por tienda
  const porTienda = new Map<string, { html: string; monto: number }[]>();
  for (const r of nuevas.sort((a, b) => (a.salesDates[0] ?? a.depositDate).localeCompare(b.salesDates[0] ?? b.depositDate))) {
    const f = await filaResultado(r);
    porTienda.set(f.tienda, [...(porTienda.get(f.tienda) ?? []), f]);
  }
  const th = (t: string) => `<th style="text-align:left;padding:6px 8px;background:#f3f4f6;font-size:12px;color:#555">${t}</th>`;
  let cuerpo = "";
  if (nuevas.length === 0) cuerpo += `<p style="color:#15803d"><b>✓ No hay diferencias nuevas</b> desde el último correo.</p>`;
  else
    for (const [tienda, filas] of [...porTienda.entries()].sort()) {
      cuerpo += `<h3 style="margin:18px 0 6px;font-size:15px;color:#1f2937">${esc(tienda)} <span style="font-weight:normal;color:#6b7280;font-size:13px">(${filas.length})</span></h3>
<table style="border-collapse:collapse;width:100%;font-size:14px">${"<tr>" + th("Día") + th("Canal") + th("Diferencia") + th("Detalle / quién") + "</tr>"}${filas.map((f) => f.html).join("")}</table>`;
    }

  // efectivo vendido y aún sin consignar (solo tiendas físicas)
  const pend = l.summary.pendings.filter((p) => p.storeCode && p.storeCode !== "PRIN" && p.total > 0);
  if (pend.length) {
    cuerpo += `<h3 style="margin:22px 0 6px;font-size:15px;color:#1f2937">Efectivo vendido pendiente por consignar</h3><ul style="margin:0;padding-left:18px;font-size:14px">`;
    for (const p of pend) cuerpo += `<li><b>${esc(p.storeName)}</b>: ${cop(p.total)} — ${p.days.map((d) => `${dia(d.date)} ${cop(d.amount)}`).join(", ")}</li>`;
    cuerpo += `</ul>`;
  }

  // lo que sigue abierto de correos anteriores
  if (viejas.length) {
    const res = new Map<string, { n: number; monto: number }>();
    for (const r of viejas) {
      const t = r.storeCode ? r.storeName : "Empresa (QR)";
      const x = res.get(t) ?? { n: 0, monto: 0 };
      x.n++;
      x.monto += Math.abs(r.channel === "DATAFONO" && (r.falta || r.sobra) ? (r.falta ?? 0) + (r.sobra ?? 0) : r.difference);
      res.set(t, x);
    }
    cuerpo += `<h3 style="margin:22px 0 6px;font-size:15px;color:#1f2937">Siguen sin resolver (de correos anteriores)</h3><ul style="margin:0;padding-left:18px;font-size:14px">`;
    for (const [t, x] of [...res.entries()].sort()) cuerpo += `<li>${esc(t)}: ${x.n} diferencia${x.n > 1 ? "s" : ""} por ${cop(x.monto)}</li>`;
    cuerpo += `</ul>`;
  }

  const cut = l.cut;
  const hoy = new Date().toLocaleDateString("en-CA", { timeZone: "America/Bogota" });
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;max-width:760px;color:#111">
<h2 style="margin:0 0 4px;color:#3BA55D">Conciliación de tiendas — ${dia(hoy)}</h2>
<p style="margin:0 0 12px;color:#6b7280;font-size:13px">Datos cargados: ventas Karrot hasta ${cut.sales ? dia(cut.sales) : "—"} · bancos hasta ${cut.bank ? dia(cut.bank) : "—"} · datáfono (Credibanco) hasta ${cut.datafono ? dia(cut.datafono) : "—"}. El datáfono llega con un día hábil de rezago.</p>
${nuevas.length ? `<p style="margin:0 0 8px"><b>${nuevas.length} diferencia${nuevas.length > 1 ? "s" : ""} nueva${nuevas.length > 1 ? "s" : ""}</b> para revisar con las vendedoras:</p>` : ""}
${cuerpo}
<p style="margin:22px 0 0;font-size:13px"><a href="${APP}/tiendas" style="color:#3BA55D">Ver el detalle en el conciliador →</a> (clic en la cifra del día para ver factura por factura)</p>
<p style="margin:8px 0 0;font-size:12px;color:#9ca3af">Correo automático del Conciliador Plazet, todos los días a las 9 am.</p></div>`;

  if (HTML_OUT) {
    fs.writeFileSync(HTML_OUT, html);
    console.log(`HTML en ${HTML_OUT} · nuevas ${nuevas.length} · siguen ${viejas.length}`);
    process.exit(0);
  }

  const user = process.env.SMTP_USER!;
  const para = PRUEBA ? user : (process.env.CORREO_DIFERENCIAS_PARA ?? "jero@plazet.co");
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST ?? "smtp.gmail.com",
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: { user, pass: process.env.SMTP_PASS },
  });
  const asunto = nuevas.length
    ? `Conciliación tiendas ${dia(hoy)}: ${nuevas.length} diferencia${nuevas.length > 1 ? "s" : ""} nueva${nuevas.length > 1 ? "s" : ""}`
    : `Conciliación tiendas ${dia(hoy)}: sin diferencias nuevas`;
  await transporter.sendMail({ from: `Conciliador Plazet <${user}>`, to: para, subject: (PRUEBA ? "[PRUEBA] " : "") + asunto, html });
  console.log(`CORREO enviado a ${para}: ${asunto}`);

  if (!PRUEBA) {
    fs.mkdirSync(path.dirname(ESTADO), { recursive: true });
    fs.writeFileSync(ESTADO, JSON.stringify([...new Set([...reportadas, ...abiertas.map((r) => r.id)])], null, 0));
  }
  process.exit(0);
}

main().catch((e) => {
  console.error("ERROR", e);
  process.exit(1);
});
