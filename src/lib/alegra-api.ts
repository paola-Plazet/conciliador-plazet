// Cliente de la API de Alegra: pagos recibidos con su CUENTA destino
// (QR Bancolombia, Rappi/Addi, Mercadopago, Credibanco, Alianza, Efectivo POS…).
// Es el detalle que los reportes descargables de Alegra no incluyen.
// Auth: Basic email:token — env ALEGRA_EMAIL / ALEGRA_TOKEN.

export interface AlegraPagoApi {
  alegraId: string;
  date: string;
  amount: number;
  cuenta: string;
  metodo: string;
  invoice: string | null;
}

interface RawPago {
  id: number | string;
  date: string;
  amount: number;
  paymentMethod?: string | null;
  bankAccount?: { name?: string } | null;
  invoices?: { number?: string }[] | null;
}

function auth(): string {
  const email = process.env.ALEGRA_EMAIL;
  const token = process.env.ALEGRA_TOKEN;
  if (!email || !token) throw new Error("Faltan ALEGRA_EMAIL / ALEGRA_TOKEN en el entorno.");
  return "Basic " + Buffer.from(`${email}:${token}`).toString("base64");
}

async function getJson(url: string): Promise<unknown> {
  const res = await fetch(url, { headers: { Authorization: auth(), Accept: "application/json" } });
  if (!res.ok) throw new Error(`Alegra: HTTP ${res.status} en ${url.split("?")[0]}`);
  return res.json();
}

/** Trae TODOS los pagos de ingreso de un mes (YYYY-MM), paginando en paralelo. */
export async function fetchAlegraPagosMes(month: string): Promise<AlegraPagoApi[]> {
  const desde = `${month}-01`;
  const hasta = `${month}-31`; // date_beforeOrNow acepta fechas inexistentes sin problema
  const base =
    `https://api.alegra.com/api/v1/payments?type=in&order_field=date&order_direction=ASC` +
    `&date_afterOrNow=${desde}&date_beforeOrNow=${hasta}`;

  const first = (await getJson(`${base}&metadata=true&limit=30&start=0`)) as {
    metadata: { total: number };
    data: RawPago[];
  };
  const total = first.metadata?.total ?? first.data.length;
  const all: RawPago[] = [...first.data];

  const offsets: number[] = [];
  for (let start = 30; start < total; start += 30) offsets.push(start);
  const LOTE = 5; // páginas en paralelo (respetando el rate limit de Alegra)
  for (let i = 0; i < offsets.length; i += LOTE) {
    const lote = offsets.slice(i, i + LOTE);
    const paginas = await Promise.all(
      lote.map((start) => getJson(`${base}&limit=30&start=${start}`) as Promise<RawPago[]>),
    );
    for (const p of paginas) all.push(...p);
  }

  return all
    .filter((p) => p.date?.startsWith(month))
    .map((p) => ({
      alegraId: String(p.id),
      date: p.date,
      amount: p.amount,
      cuenta: p.bankAccount?.name ?? "?",
      metodo: p.paymentMethod ?? "?",
      invoice: p.invoices?.[0]?.number ?? null,
    }));
}

/** Alegra dejó de ser fuente confiable el 8-jul-2026 (dato de Paola, 07-sep):
 * después de esa fecha los pagos se registran sin el detalle real de cuenta
 * (solo Alianza / AH 3911). El cruce solo confía en Alegra hasta aquí. */
export const ALEGRA_CONFIABLE_HASTA = "2026-07-08";

/** Cuentas de Alegra que significan "esta transferencia NO es QR Bancolombia":
 * el POS la registró como transferencia pero la plata entró por otra
 * plataforma — no hay que esperarla en los PAGO QR del banco. */
export const CUENTAS_NO_QR = ["Rappi / Addi", "Mercadopago", "Nequi"];
