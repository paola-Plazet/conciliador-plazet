import { NextRequest } from "next/server";
import { prisma } from "../src/lib/db";
import { GET } from "../src/app/api/notas/route";
async function main() {
  const n = await prisma.dayNote.findMany({ orderBy: { id: "desc" }, take: 10, include: { adjuntos: { select: { id: true, size: true } } } });
  console.log("NOTAS EN BD:", n.length);
  for (const x of n) console.log(JSON.stringify({ ...x, note: x.note.slice(0, 80) }));
  for (const m of ["2026-09", "2026-08"]) {
    const res = await GET(new NextRequest(`http://localhost/api/notas?month=${m}`));
    console.log(m, "GET status", res.status, JSON.stringify(await res.json()).slice(0, 300));
  }
  await prisma.$disconnect();
}
main();
