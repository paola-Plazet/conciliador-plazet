import { NextRequest, NextResponse } from "next/server";
import { conciliarPrincipal } from "@/lib/principal-cruce";

export const runtime = "nodejs";

/** Bodega PRINCIPAL: cada factura de Karrot contra su cobro (MP o banco) y
 * los cobros web / Mercado Libre que no tienen factura. */
export async function GET(req: NextRequest) {
  return NextResponse.json(await conciliarPrincipal(req.nextUrl.searchParams.get("month")));
}
