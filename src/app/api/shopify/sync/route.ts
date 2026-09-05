import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { validarSesion, SESSION_COOKIE } from "@/lib/sso";
import { shopConfigs, fetchWebOrders } from "@/lib/shopify";

export const runtime = "nodejs";
// La sincronización puede tardar (paginación de pedidos de dos tiendas)
export const maxDuration = 60;

const NIVEL: Record<string, number> = { VIEWER: 0, EDITOR: 1, ADMIN: 2 };

/** Sincroniza los pedidos web de Shopify (Plazet + Natural Light) por API.
 * Reemplaza por completo los pedidos guardados de cada tienda: Shopify es
 * la fuente de verdad y el volumen es bajo. Rol EDITOR+. */
export async function POST(req: NextRequest) {
  const sesion = await validarSesion(req.cookies.get(SESSION_COOKIE)?.value);
  if (!sesion) return NextResponse.json({ error: "Sesión requerida." }, { status: 401 });
  if (NIVEL[sesion.rol] < NIVEL.EDITOR) {
    return NextResponse.json({ error: "Tu rol no permite sincronizar." }, { status: 403 });
  }

  const cfgs = shopConfigs();
  if (cfgs.length === 0) {
    return NextResponse.json(
      { error: "Faltan las credenciales de Shopify (variables SHOPIFY_… en el entorno)." },
      { status: 500 },
    );
  }

  const out: { shop: string; label: string; orders: number; from: string | null; to: string | null }[] = [];
  const errors: string[] = [];
  for (const cfg of cfgs) {
    try {
      const orders = await fetchWebOrders(cfg);
      await prisma.shopifyOrder.deleteMany({ where: { shop: cfg.key } });
      if (orders.length > 0) {
        await prisma.shopifyOrder.createMany({
          data: orders.map((o) => ({
            shop: o.shop,
            name: o.name,
            orderId: o.orderId,
            date: o.date,
            amount: o.amount,
            refund: o.refund,
            refundDate: o.refundDate,
            gateway: o.gateway,
            financial: o.financial,
          })),
        });
      }
      const dates = orders.map((o) => o.date).sort();
      await prisma.upload.create({
        data: {
          filename: `Shopify ${cfg.label} (API)`,
          kind: "shopify",
          dateFrom: dates[0] ?? null,
          dateTo: dates[dates.length - 1] ?? null,
          rows: orders.length,
        },
      });
      out.push({ shop: cfg.key, label: cfg.label, orders: orders.length, from: dates[0] ?? null, to: dates[dates.length - 1] ?? null });
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e));
    }
  }

  if (out.length === 0) {
    return NextResponse.json({ error: errors.join(" · ") || "No se pudo sincronizar." }, { status: 502 });
  }
  return NextResponse.json({ ok: true, shops: out, errors });
}
