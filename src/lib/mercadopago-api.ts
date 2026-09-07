// Cliente de la API de Mercado Pago para el canal MP.
// Usa el Access Token de producción de la app "Conciliador Habbie"
// (cuenta HABBIE SAS — la misma cuenta cobra la web de Plazet y la de
// Natural Light, y los QR/MP del POS). Variable de entorno: MP_ACCESS_TOKEN.
//
// Trae los pagos (cobros) y los convierte a la MISMA forma de la tabla
// MercadopagoEntry que antes se llenaba con el archivo de liquidaciones:
//   date (fecha de aprobación, hora Colombia), opId, medio, bruto, neto, release.

export const MP_SINCE = "2026-04-01";

const MEDIO: Record<string, string> = {
  credit_card: "Tarjeta de crédito",
  debit_card: "Tarjeta de débito",
  bank_transfer: "Transferencia bancaria",
  ticket: "Cupón de pago",
  account_money: "Dinero en cuenta",
  prepaid_card: "Tarjeta prepago",
};

export interface MpApiEntry {
  date: string;
  opId: string;
  medio: string;
  bruto: number;
  neto: number;
  release: string | null;
}

interface MpPayment {
  id: number;
  status: string;
  operation_type: string;
  live_mode: boolean;
  date_approved: string | null;
  payment_type_id: string;
  transaction_amount: number;
  transaction_details?: { net_received_amount?: number };
  money_release_date?: string | null;
  description?: string;
}

/** Fecha YYYY-MM-DD en hora Colombia (UTC-5); el ISO de MP trae su propio offset */
function toColombiaDate(iso: string): string {
  return new Date(new Date(iso).getTime() - 5 * 3600_000).toISOString().slice(0, 10);
}

/** Trae todos los cobros aprobados (incluye los luego reembolsados: la plata
 * entró y así se comparaba también con el archivo de liquidaciones). */
export async function fetchMpPayments(since = MP_SINCE): Promise<MpApiEntry[]> {
  const token = process.env.MP_ACCESS_TOKEN;
  if (!token) throw new Error("Falta MP_ACCESS_TOKEN en el entorno.");
  const out: MpApiEntry[] = [];
  const limit = 100;
  for (let offset = 0; offset < 20000; offset += limit) {
    const url =
      `https://api.mercadopago.com/v1/payments/search?range=date_created` +
      `&begin_date=${since}T00:00:00.000-05:00&end_date=2100-01-01T00:00:00.000-05:00` +
      `&sort=date_created&criteria=asc&limit=${limit}&offset=${offset}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error(`Mercado Pago: error consultando pagos (HTTP ${res.status}).`);
    const body = (await res.json()) as { results: MpPayment[]; paging: { total: number } };
    for (const p of body.results) {
      if (!p.live_mode || p.operation_type !== "regular_payment") continue;
      if (p.status !== "approved" && p.status !== "refunded") continue;
      if (!p.date_approved) continue;
      out.push({
        date: toColombiaDate(p.date_approved),
        opId: String(p.id),
        medio: MEDIO[p.payment_type_id] ?? p.payment_type_id,
        bruto: p.transaction_amount,
        neto: p.transaction_details?.net_received_amount ?? p.transaction_amount,
        release: p.money_release_date ? toColombiaDate(p.money_release_date) : null,
      });
    }
    if (offset + limit >= body.paging.total) break;
  }
  return out;
}
