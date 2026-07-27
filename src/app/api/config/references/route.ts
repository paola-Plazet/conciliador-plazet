import { prisma } from "@/lib/db";

export const runtime = "nodejs";

/** Lista las referencias de efectivo del acumulado del banco (con totales)
 * combinadas con el mapeo actual referencia -> tienda. */
export async function GET() {
  const mappings = await prisma.cashReference.findMany({
    include: { store: true },
  });
  const mapByRef = new Map(
    mappings.map((m) => [m.reference, { code: m.store.code, name: m.store.name }]),
  );

  // Agrega las referencias vistas en el acumulado del banco
  const entries = await prisma.bankEntry.findMany({
    where: { kind: "RECAUDO_EFECTIVO", reference: { not: null } },
    select: { reference: true, amount: true },
  });
  const agg = new Map<string, { count: number; total: number }>();
  for (const e of entries) {
    if (!e.reference) continue;
    const a = agg.get(e.reference) ?? { count: 0, total: 0 };
    a.count++;
    a.total += e.amount;
    agg.set(e.reference, a);
  }

  // Unión: referencias vistas + referencias ya mapeadas aunque no estén en la corrida
  const allRefs = new Set<string>([...agg.keys(), ...mapByRef.keys()]);
  const references = [...allRefs]
    .map((reference) => ({
      reference,
      count: agg.get(reference)?.count ?? 0,
      total: agg.get(reference)?.total ?? 0,
      storeCode: mapByRef.get(reference)?.code ?? null,
      storeName: mapByRef.get(reference)?.name ?? null,
    }))
    .sort((a, b) => b.total - a.total);

  return Response.json({ references });
}

/** Asigna (o reasigna) una referencia a una tienda.
 * body: { reference: string, storeCode: string | null }
 * storeCode null elimina la asignación. */
export async function POST(req: Request) {
  const body = (await req.json()) as { reference: string; storeCode: string | null };
  const reference = String(body.reference).trim();
  if (!reference) {
    return Response.json({ error: "Referencia vacía" }, { status: 400 });
  }

  if (!body.storeCode) {
    await prisma.cashReference.deleteMany({ where: { reference } });
    return Response.json({ ok: true, removed: true });
  }

  const store = await prisma.store.findUnique({ where: { code: body.storeCode } });
  if (!store) return Response.json({ error: "Tienda no existe" }, { status: 400 });

  await prisma.cashReference.upsert({
    where: { reference },
    update: { storeId: store.id },
    create: { reference, storeId: store.id },
  });
  return Response.json({ ok: true });
}
