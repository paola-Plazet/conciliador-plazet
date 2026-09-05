// Cliente Admin API de Shopify para el canal WEB.
// Cada tienda (Plazet y Natural Light) tiene su propia app "Conciliador"
// creada en el Dev Dashboard de su organización, con scopes
// read_orders + read_all_orders. El token se obtiene con el
// client credentials grant (dura 24h, sin OAuth interactivo):
//   POST https://{shop}.myshopify.com/admin/oauth/access_token
//   { client_id, client_secret, grant_type: "client_credentials" }
// Credenciales en variables de entorno (Vercel + .env local):
//   SHOPIFY_PLAZET_SHOP / _CLIENT_ID / _CLIENT_SECRET
//   SHOPIFY_NL_SHOP / _CLIENT_ID / _CLIENT_SECRET

const API_VERSION = "2026-07";
/** Desde cuándo traemos pedidos (arranque del histórico del conciliador) */
export const WEB_SINCE = "2026-04-01";

export type WebShop = "PLAZET" | "NL";

export interface ShopConfig {
  key: WebShop;
  label: string;
  domain: string; // xxx.myshopify.com
  clientId: string;
  clientSecret: string;
}

export function shopConfigs(): ShopConfig[] {
  const defs: { key: WebShop; label: string; prefix: string; fallback: string }[] = [
    { key: "PLAZET", label: "Plazet", prefix: "SHOPIFY_PLAZET", fallback: "plazet.myshopify.com" },
    { key: "NL", label: "Natural Light", prefix: "SHOPIFY_NL", fallback: "natural-light-colombia.myshopify.com" },
  ];
  const out: ShopConfig[] = [];
  for (const d of defs) {
    const clientId = process.env[`${d.prefix}_CLIENT_ID`];
    const clientSecret = process.env[`${d.prefix}_CLIENT_SECRET`];
    if (!clientId || !clientSecret) continue; // tienda sin credenciales: se omite
    out.push({
      key: d.key,
      label: d.label,
      domain: process.env[`${d.prefix}_SHOP`] ?? d.fallback,
      clientId,
      clientSecret,
    });
  }
  return out;
}

// token cacheado por dominio (dura 24h; renovamos con margen)
const tokenCache = new Map<string, { token: string; expiresAt: number }>();

async function getToken(cfg: ShopConfig): Promise<string> {
  const hit = tokenCache.get(cfg.domain);
  if (hit && hit.expiresAt > Date.now() + 60_000) return hit.token;
  const res = await fetch(`https://${cfg.domain}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      grant_type: "client_credentials",
    }),
  });
  if (!res.ok) {
    throw new Error(`Shopify ${cfg.label}: no se pudo obtener token (HTTP ${res.status}).`);
  }
  const data = (await res.json()) as { access_token: string; expires_in: number };
  tokenCache.set(cfg.domain, {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in ?? 86000) * 1000,
  });
  return data.access_token;
}

/** Fecha YYYY-MM-DD en hora Colombia (UTC-5, sin horario de verano) */
function toColombiaDate(iso: string): string {
  return new Date(new Date(iso).getTime() - 5 * 3600_000).toISOString().slice(0, 10);
}

export interface WebOrder {
  shop: WebShop;
  name: string;
  orderId: string;
  date: string; // fecha del pago (Colombia)
  amount: number; // cobrado (SALE/CAPTURE exitosos)
  refund: number; // reembolsado
  refundDate: string | null;
  gateway: string;
  financial: string;
}

interface GqlTx {
  kind: string;
  status: string;
  processedAt: string;
  gateway: string;
  amountSet: { shopMoney: { amount: string } };
}
interface GqlOrder {
  id: string;
  name: string;
  createdAt: string;
  displayFinancialStatus: string | null;
  paymentGatewayNames: string[];
  transactions: GqlTx[];
}

const ORDERS_QUERY = `
query($after: String, $q: String) {
  orders(first: 50, after: $after, query: $q) {
    edges { node {
      id name createdAt displayFinancialStatus paymentGatewayNames
      transactions(first: 10) { kind status processedAt gateway amountSet { shopMoney { amount } } }
    } }
    pageInfo { hasNextPage endCursor }
  }
}`;

/** Trae TODOS los pedidos de la tienda desde `since` (fecha de creación). */
export async function fetchWebOrders(cfg: ShopConfig, since = WEB_SINCE): Promise<WebOrder[]> {
  const token = await getToken(cfg);
  const orders: WebOrder[] = [];
  let after: string | null = null;
  for (let page = 0; page < 200; page++) {
    const res: Response = await fetch(`https://${cfg.domain}/admin/api/${API_VERSION}/graphql.json`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": token },
      body: JSON.stringify({
        query: ORDERS_QUERY,
        variables: { after, q: `created_at:>=${since}` },
      }),
    });
    if (!res.ok) throw new Error(`Shopify ${cfg.label}: error consultando pedidos (HTTP ${res.status}).`);
    const body = (await res.json()) as {
      data?: { orders: { edges: { node: GqlOrder }[]; pageInfo: { hasNextPage: boolean; endCursor: string | null } } };
      errors?: { message: string }[];
    };
    if (body.errors?.length) throw new Error(`Shopify ${cfg.label}: ${body.errors[0].message}`);
    const conn = body.data!.orders;
    for (const { node } of conn.edges) {
      const ok = (t: GqlTx) => t.status === "SUCCESS";
      const sales = node.transactions.filter((t) => ok(t) && (t.kind === "SALE" || t.kind === "CAPTURE"));
      if (sales.length === 0) continue; // pedido sin pago efectivo: no entra a conciliación
      const refunds = node.transactions.filter((t) => ok(t) && t.kind === "REFUND");
      const amount = sales.reduce((s, t) => s + parseFloat(t.amountSet.shopMoney.amount), 0);
      const refund = refunds.reduce((s, t) => s + parseFloat(t.amountSet.shopMoney.amount), 0);
      orders.push({
        shop: cfg.key,
        name: node.name,
        orderId: node.id.split("/").pop() ?? node.id,
        date: toColombiaDate(sales[0].processedAt),
        amount,
        refund,
        refundDate: refunds.length ? toColombiaDate(refunds[refunds.length - 1].processedAt) : null,
        gateway: sales[0].gateway || node.paymentGatewayNames[0] || "?",
        financial: node.displayFinancialStatus ?? "?",
      });
    }
    if (!conn.pageInfo.hasNextPage) break;
    after = conn.pageInfo.endCursor;
  }
  return orders;
}
