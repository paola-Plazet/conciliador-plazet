// Correo diario (9 am) a Jero con TODAS las diferencias de la conciliación de
// tiendas que siguen sin resolver (meses no cerrados), por tienda y por canal:
// efectivo, datáfono y QR por tienda — lo mismo que muestra /tiendas (se arma
// con /api/dashboard, /api/datafono-dia y /api/qr-dia, sin lógica propia).
// Lo corre la tarea de Windows "Conciliador correo 9am" (robot-bancos/diario_9am.py)
// DESPUÉS de cargar las ventas de Karrot; los bancos ya los carga el robot cada hora.
//
//   npx tsx scripts/correo-diferencias.ts            → envía a Jero y guarda qué ya salió
//   npx tsx scripts/correo-diferencias.ts --prueba   → envía solo a SMTP_USER, sin guardar
//   npx tsx scripts/correo-diferencias.ts --html x   → escribe el HTML en x, no envía
//
// Resuelta = día que ya cuadra, aceptado a mano (MANUAL) o de un mes cerrado.
// Las que no salieron en el correo anterior se marcan NUEVA (data-correo/reportadas.json).
import fs from "fs";
import path from "path";
import nodemailer from "nodemailer";
import { NextRequest } from "next/server";
import { prisma } from "../src/lib/db";
import { computeLedger } from "../src/lib/ledger";
import { GET as dashboardGET } from "../src/app/api/dashboard/route";
import { GET as datafonoDiaGET } from "../src/app/api/datafono-dia/route";
import { GET as qrDiaGET } from "../src/app/api/qr-dia/route";

const APP = "https://conciliador-plazet.vercel.app";
const ESTADO = path.join(__dirname, "..", "data-correo", "reportadas.json");
const args = process.argv.slice(2);
const PRUEBA = args.includes("--prueba");
const HTML_OUT = args.includes("--html") ? args[args.indexOf("--html") + 1] : null;

const cop = (n: number) => (n < 0 ? "−" : "") + "$" + Math.round(Math.abs(n)).toLocaleString("es-CO");
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const MESES_LARGO = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
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
const ROJO = "#b91c1c", AMBAR = "#b45309";
const falta = (n: number) => `<span style="color:${ROJO};font-weight:600">falta ${cop(n)}</span>`;
const sobra = (n: number) => `<span style="color:${AMBAR};font-weight:600">sobra ${cop(n)}</span>`;

const api = async (handler: (r: NextRequest) => Promise<Response>, url: string) =>
  (await handler(new NextRequest(`http://local${url}`))).json();

function leerEstado(): Set<string> {
  try {
    return new Set(JSON.parse(fs.readFileSync(ESTADO, "utf8")) as string[]);
  } catch {
    return new Set();
  }
}

/** vendedoras con ventas en la tienda esos días (de un método, si se indica) */
async function vendedoras(store: string, dates: string[], methods?: string[]): Promise<string[]> {
  const rows = await prisma.sale.findMany({
    where: { storeCode: store, date: { in: dates }, vendedor: { not: null }, ...(methods ? { method: { in: methods } } : {}) },
    select: { vendedor: true },
    distinct: ["vendedor"],
  });
  return rows.map((r) => nombreCorto(r.vendedor)).sort();
}

// ── detalle por canal ─────────────────────────────────────────────────────

interface DiaDash {
  date: string;
  efe: { venta: number; deposito: number | null; depositoFecha: string | null; grupo: string[]; dif: number; estado: string; enPlazo?: boolean; nota?: string };
  tar: { venta: number; plink: number; falta: number; sobra: number; sinCargar: boolean; cc: boolean };
  qrVenta: number;
  qrBanco: number;
  qrDif: number;
  qrSinCargar: boolean;
}

async function detalleEfectivo(store: string, d: DiaDash): Promise<string[]> {
  const e = d.efe;
  const dias = e.grupo.length ? e.grupo : [d.date];
  const out: string[] = [];
  if (e.estado === "PENDIENTE") out.push(`Vendido en efectivo ${cop(e.venta)} y <b>no se ha consignado</b> (ya se venció el plazo)`);
  else if (e.deposito != null)
    // dif = depósito − venta del grupo de días que cubre esa consignación
    out.push(`Vendido en efectivo ${cop(e.deposito - e.dif)}${e.grupo.length > 1 ? ` (días ${e.grupo.map(dia).join(", ")})` : ""} · consignado ${cop(e.deposito)}${e.depositoFecha ? ` el ${dia(e.depositoFecha)}` : ""}`);
  if (e.nota) out.push(esc(e.nota));
  const v = await vendedoras(store, dias, ["EFECTIVO"]);
  if (v.length) out.push(`Vendieron en efectivo: <b>${v.map(esc).join(", ")}</b>`);
  return out;
}

async function detalleDatafono(store: string, date: string): Promise<string[]> {
  const det = await api(datafonoDiaGET, `/api/datafono-dia?date=${date}&store=${store}`);
  const out: string[] = [];
  for (const p of det.pos as { invoice: string; hora: string | null; amount: number; vendedor: string | null; match: { gross: number; difValor: number } | null }[]) {
    const quien = `<b>${esc(nombreCorto(p.vendedor))}</b>`;
    const fac = `factura ${esc(p.invoice)}${p.hora ? ` (${p.hora})` : ""}`;
    if (!p.match) out.push(`${quien} · ${fac} por ${cop(p.amount)} → <span style="color:${ROJO}">no está en el datáfono</span>`);
    else if (Math.abs(p.match.difValor) > 50)
      out.push(`${quien} · ${fac}: facturó ${cop(p.amount)} y el datáfono cobró ${cop(p.match.gross)} (<span style="color:${ROJO}">${p.match.difValor > 0 ? "+" : ""}${cop(p.match.difValor)}</span>)`);
  }
  const sueltas = det.sueltas as { gross: number; autorizacion: string | null }[];
  if (sueltas.length) {
    const turno = ((det.vendedorasDia ?? []) as string[]).map(nombreCorto);
    for (const t of sueltas)
      out.push(`Cobro en el datáfono de ${cop(t.gross)}${t.autorizacion ? ` (aut. ${esc(t.autorizacion)})` : ""} <span style="color:${AMBAR}">sin factura en Karrot</span>${turno.length ? ` · ese día vendieron: ${turno.map(esc).join(", ")}` : ""}`);
  }
  return out;
}

async function detalleQr(store: string, d: DiaDash): Promise<string[]> {
  const det = await api(qrDiaGET, `/api/qr-dia?date=${d.date}&store=${store}`);
  const out = [`Vendido por QR ${cop(d.qrVenta)} · llegó al banco ${cop(d.qrBanco)}`];
  for (const f of det.facturas as { invoice: string; amount: number; vendedor: string | null; pago: unknown }[])
    if (!f.pago) out.push(`<b>${esc(nombreCorto(f.vendedor))}</b> · factura ${esc(f.invoice)} por ${cop(f.amount)} → <span style="color:${ROJO}">el pago QR no aparece en el banco</span>`);
  return out;
}

// ── armado ────────────────────────────────────────────────────────────────

interface Fila { key: string; store: string; date: string; canal: string; dif: string; detalle: string[] }

async function main() {
  const ledger = await computeLedger();
  const abiertos = ledger.months.filter((m) => !m.closed).map((m) => m.month).sort();
  // aceptadas a mano en el motor (datáfono por tienda/día, QR por día de empresa)
  const manualTar = new Set(ledger.summary.results.filter((r) => r.channel === "DATAFONO" && r.status === "MANUAL").map((r) => `${r.storeCode}|${r.depositDate}`));
  const manualQr = new Set(ledger.summary.results.filter((r) => r.channel === "QR" && r.status === "MANUAL").map((r) => r.depositDate));

  const filas: Fila[] = [];
  const qrSinTienda: { date: string; amount: number; payer: string; stores: string[] }[] = [];
  const nombres = new Map<string, string>();

  for (const month of abiertos) {
    const dash = await api(dashboardGET, `/api/dashboard?month=${month}`);
    for (const s of dash.stores as { code: string; name: string }[]) nombres.set(s.code, s.name);
    for (const r of (dash.qrResumen?.revisar ?? []) as typeof qrSinTienda) qrSinTienda.push(r);
    for (const [store, st] of Object.entries(dash.data as Record<string, { days: DiaDash[] }>)) {
      for (const d of st.days) {
        const e = d.efe;
        // EFECTIVO: diferencia, sin conciliar o vendido y ya vencido sin consignar
        if (e.estado === "DIFERENCIA" || e.estado === "SIN_CONCILIAR" || (e.estado === "PENDIENTE" && !e.enPlazo)) {
          const n = -e.dif; // > 0 = falta
          filas.push({ key: `${store}|${d.date}|EFE`, store, date: d.date, canal: "Efectivo", dif: n > 0 ? falta(n) : sobra(-n), detalle: await detalleEfectivo(store, d) });
        }
        // DATÁFONO: cruce exacto transacción a transacción (falta y sobra sin netear)
        if (!d.tar.sinCargar && !d.tar.cc && (d.tar.falta > 0 || d.tar.sobra > 0) && !manualTar.has(`${store}|${d.date}`)) {
          const dif = [d.tar.falta > 0 ? falta(d.tar.falta) : "", d.tar.sobra > 0 ? sobra(d.tar.sobra) : ""].filter(Boolean).join(" · ");
          filas.push({ key: `${store}|${d.date}|TAR`, store, date: d.date, canal: "Datáfono", dif, detalle: await detalleDatafono(store, d.date) });
        }
        // QR por tienda (pagos del banco asignados a la tienda por valor)
        if (!d.qrSinCargar && Math.abs(d.qrDif) >= 1 && !manualQr.has(d.date)) {
          filas.push({ key: `${store}|${d.date}|QR`, store, date: d.date, canal: "QR", dif: d.qrDif > 0 ? falta(d.qrDif) : sobra(-d.qrDif), detalle: await detalleQr(store, d) });
        }
      }
    }
  }

  const reportadas = leerEstado();
  const nuevas = filas.filter((f) => !reportadas.has(f.key)).length;
  const primerCorreo = reportadas.size === 0;

  const th = (t: string) => `<th style="text-align:left;padding:6px 8px;background:#f3f4f6;font-size:12px;color:#555">${t}</th>`;
  const td = (t: string, extra = "") => `<td style="padding:6px 8px;border-bottom:1px solid #eee;vertical-align:top;${extra}">${t}</td>`;
  let cuerpo = "";
  const porTienda = new Map<string, Fila[]>();
  for (const f of filas) porTienda.set(f.store, [...(porTienda.get(f.store) ?? []), f]);
  if (filas.length === 0) cuerpo += `<p style="color:#15803d"><b>✓ Todo está conciliado.</b> No hay diferencias pendientes.</p>`;
  for (const [store, fs_] of [...porTienda.entries()].sort((a, b) => (nombres.get(a[0]) ?? a[0]).localeCompare(nombres.get(b[0]) ?? b[0]))) {
    fs_.sort((a, b) => a.date.localeCompare(b.date) || a.canal.localeCompare(b.canal));
    cuerpo += `<h3 style="margin:22px 0 6px;font-size:15px;color:#1f2937">${esc(nombres.get(store) ?? store)} <span style="font-weight:normal;color:#6b7280;font-size:13px">(${fs_.length} pendiente${fs_.length > 1 ? "s" : ""})</span></h3>
<table style="border-collapse:collapse;width:100%;font-size:14px"><tr>${th("Día")}${th("Canal")}${th("Diferencia")}${th("Detalle / quién")}</tr>`;
    let mesActual = "";
    for (const f of fs_) {
      const mes = f.date.slice(0, 7);
      if (mes !== mesActual) {
        mesActual = mes;
        cuerpo += `<tr><td colspan="4" style="padding:8px 8px 2px;font-size:12px;font-weight:bold;color:#3BA55D;text-transform:uppercase">${MESES_LARGO[Number(mes.slice(5)) - 1]}</td></tr>`;
      }
      const nueva = !primerCorreo && !reportadas.has(f.key) ? ` <span style="background:#fee2e2;color:${ROJO};font-size:10px;font-weight:bold;padding:1px 5px;border-radius:8px">NUEVA</span>` : "";
      cuerpo += `<tr>${td(dia(f.date) + nueva, "white-space:nowrap")}${td(f.canal)}${td(f.dif, "white-space:nowrap")}${td(f.detalle.join("<br>"), "font-size:13px")}</tr>`;
    }
    cuerpo += `</table>`;
  }
  if (qrSinTienda.length) {
    cuerpo += `<h3 style="margin:22px 0 6px;font-size:15px;color:#1f2937">Pagos QR que no se pudieron asignar a una tienda</h3>
<p style="margin:0 0 4px;font-size:13px;color:#6b7280">El banco no dice de qué tienda es cada QR; estos calzan con ventas de varias tiendas. Se asignan en /tiendas → QR (“¿de qué tienda es?”).</p><ul style="margin:0;padding-left:18px;font-size:14px">`;
    for (const r of qrSinTienda) cuerpo += `<li>${dia(r.date)} · ${cop(r.amount)} · ${esc(r.payer)} → ${r.stores.map(esc).join(" o ")}</li>`;
    cuerpo += `</ul>`;
  }

  const cut = ledger.cut;
  const hoy = new Date().toLocaleDateString("en-CA", { timeZone: "America/Bogota" });
  const resumen = filas.length
    ? `<p style="margin:0 0 8px"><b>${filas.length} diferencia${filas.length > 1 ? "s" : ""} sin resolver</b>${!primerCorreo && nuevas ? ` (<b style="color:${ROJO}">${nuevas} nueva${nuevas > 1 ? "s" : ""}</b> desde el correo anterior)` : ""}, de los meses abiertos (${abiertos.map((m) => MESES_LARGO[Number(m.slice(5)) - 1]).join(", ")}).</p>`
    : "";
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;max-width:780px;color:#111">
<h2 style="margin:0 0 4px;color:#3BA55D">Conciliación de tiendas — ${dia(hoy)}</h2>
<p style="margin:0 0 12px;color:#6b7280;font-size:13px">Datos cargados: ventas Karrot hasta ${cut.sales ? dia(cut.sales) : "—"} · bancos hasta ${cut.bank ? dia(cut.bank) : "—"} · QR hasta ${cut.qr ? dia(cut.qr) : "—"} · datáfono (Credibanco) hasta ${cut.datafono ? dia(cut.datafono) : "—"}. Una diferencia sale de este correo cuando el día cuadra o se acepta en el conciliador.</p>
${resumen}${cuerpo}
<p style="margin:22px 0 0;font-size:13px"><a href="${APP}/tiendas" style="color:#3BA55D">Ver el detalle en el conciliador →</a> (clic en la cifra del día para ver factura por factura)</p>
<p style="margin:8px 0 0;font-size:12px;color:#9ca3af">Correo automático del Conciliador Plazet, todos los días a las 9 am.</p></div>`;

  if (HTML_OUT) {
    fs.writeFileSync(HTML_OUT, html);
    console.log(`HTML en ${HTML_OUT} · pendientes ${filas.length} · nuevas ${nuevas} · QR sin tienda ${qrSinTienda.length}`);
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
  const asunto = filas.length
    ? `Conciliación tiendas ${dia(hoy)}: ${filas.length} diferencia${filas.length > 1 ? "s" : ""} sin resolver${!primerCorreo && nuevas ? ` (${nuevas} nueva${nuevas > 1 ? "s" : ""})` : ""}`
    : `Conciliación tiendas ${dia(hoy)}: todo conciliado`;
  await transporter.sendMail({ from: `Conciliador Plazet <${user}>`, to: para, subject: (PRUEBA ? "[PRUEBA] " : "") + asunto, html });
  console.log(`CORREO enviado a ${para}: ${asunto}`);

  if (!PRUEBA) {
    fs.mkdirSync(path.dirname(ESTADO), { recursive: true });
    fs.writeFileSync(ESTADO, JSON.stringify(filas.map((f) => f.key)));
  }
  process.exit(0);
}

main().catch((e) => {
  console.error("ERROR", e);
  process.exit(1);
});
