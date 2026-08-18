import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { computeLedger } from "@/lib/ledger";
import { validarSesion, SESSION_COOKIE } from "@/lib/sso";

export const runtime = "nodejs";

/** Lista de meses con su estado; con ?month=YYYY-MM devuelve además los
 * resultados de ese mes (para el diálogo de cierre). */
export async function GET(req: NextRequest) {
  const { summary, months, cut } = await computeLedger();
  const month = req.nextUrl.searchParams.get("month");
  if (!month) {
    const statuses = await prisma.monthStatus.findMany();
    const info = new Map(statuses.map((s) => [s.month, s]));
    return NextResponse.json({
      months: months.map((m) => ({
        ...m,
        closedAt: info.get(m.month)?.closedAt ?? null,
        closedBy: info.get(m.month)?.closedBy ?? null,
      })),
      cut,
    });
  }

  const m = months.find((x) => x.month === month);
  if (!m) return NextResponse.json({ error: `No hay datos del mes ${month}.` }, { status: 404 });
  const results = summary.results.filter((r) => (r.month ?? r.depositDate.slice(0, 7)) === month);
  return NextResponse.json({
    ...m,
    results,
    pending: results.filter((r) => r.status === "DIFERENCIA" || r.status === "SIN_CONCILIAR"),
  });
}

const NIVEL: Record<string, number> = { VIEWER: 0, EDITOR: 1, ADMIN: 2 };

/** Cierra o reabre un mes. Body: { month: "YYYY-MM", action: "close" | "reopen" }
 * Cerrar exige el mes limpio (todo CUADRA o MANUAL) y rol EDITOR+;
 * reabrir exige ADMIN. Al cerrar se guarda la FOTO de los resultados. */
export async function POST(req: NextRequest) {
  const sesion = await validarSesion(req.cookies.get(SESSION_COOKIE)?.value);
  if (!sesion) return NextResponse.json({ error: "Sesión requerida." }, { status: 401 });

  const body = (await req.json()) as { month?: string; action?: "close" | "reopen" };
  const month = body.month ?? "";
  if (!/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json({ error: "Mes inválido (formato YYYY-MM)." }, { status: 400 });
  }

  if (body.action === "reopen") {
    if (sesion.rol !== "ADMIN") {
      return NextResponse.json({ error: "Solo un ADMIN puede reabrir un mes." }, { status: 403 });
    }
    await prisma.monthStatus.upsert({
      where: { month },
      create: { month, closed: false },
      update: { closed: false, closedAt: null, closedBy: null, snapshotJson: "[]" },
    });
    return NextResponse.json({ ok: true, month, closed: false });
  }

  if (NIVEL[sesion.rol] < NIVEL.EDITOR) {
    return NextResponse.json({ error: "Tu rol no permite cerrar meses." }, { status: 403 });
  }

  // cerrar: el mes debe estar limpio (diferencias aceptadas con nota → MANUAL)
  const { summary, months } = await computeLedger();
  const m = months.find((x) => x.month === month);
  if (!m) {
    return NextResponse.json({ error: `No hay datos del mes ${month}.` }, { status: 404 });
  }
  if (m.closed) {
    return NextResponse.json({ error: `El mes ${month} ya está cerrado.` }, { status: 409 });
  }
  if (!m.clean) {
    return NextResponse.json(
      {
        error: `El mes ${month} aún tiene ${m.totals.diferencias} diferencia(s) y ${m.totals.sinConciliar} sin conciliar. Acéptalas con nota antes de cerrar.`,
        totals: m.totals,
      },
      { status: 409 },
    );
  }

  const monthResults = summary.results.filter(
    (r) => (r.month ?? r.depositDate.slice(0, 7)) === month,
  );
  await prisma.monthStatus.upsert({
    where: { month },
    create: {
      month,
      closed: true,
      closedAt: new Date(),
      closedBy: sesion.email,
      snapshotJson: JSON.stringify(monthResults),
    },
    update: {
      closed: true,
      closedAt: new Date(),
      closedBy: sesion.email,
      snapshotJson: JSON.stringify(monthResults),
    },
  });
  return NextResponse.json({ ok: true, month, closed: true, frozen: monthResults.length });
}
