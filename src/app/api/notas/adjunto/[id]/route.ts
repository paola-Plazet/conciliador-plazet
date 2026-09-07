import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

/** Sirve la imagen de un adjunto (la sesión la exige el proxy para todo /api). */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const n = Number(id);
  if (!Number.isInteger(n) || n <= 0) return NextResponse.json({ error: "id inválido" }, { status: 400 });
  const adj = await prisma.noteAttachment.findUnique({ where: { id: n } });
  if (!adj) return NextResponse.json({ error: "No existe." }, { status: 404 });
  return new Response(Buffer.from(adj.data), {
    headers: {
      "Content-Type": adj.mime,
      "Content-Length": String(adj.size),
      "Cache-Control": "private, max-age=86400",
      "Content-Disposition": `inline; filename="${adj.name.replace(/"/g, "")}"`,
    },
  });
}
