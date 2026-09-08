import { NextRequest } from "next/server";
import { GET } from "../src/app/api/qr-dia/route";
async function main() {
  const q = (await (await GET(new NextRequest("http://localhost/api/qr-dia?date=2026-08-17&store=B1"))).json()) as any;
  for (const f of q.facturas) console.log(f.invoice, f.amount, "→", f.pago ? `${f.pago.payer} ${f.pago.amount} ${f.pago.date}` : "sin pago");
}
main();
