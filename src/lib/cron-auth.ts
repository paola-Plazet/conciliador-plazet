import type { NextRequest } from "next/server";

/**
 * Autorización de los endpoints automáticos (sin sesión de usuario):
 * `Authorization: Bearer <token>`. Vercel manda CRON_SECRET solo en sus crons;
 * `extraEnv` permite tokens adicionales por endpoint (p.ej. KARROT_PUSH_TOKEN
 * para la rutina de Claude que empuja el CSV de Karrot).
 */
export function autorizadoCron(req: NextRequest, ...extraEnv: string[]): boolean {
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.replace(/^Bearer\s+/i, "").trim();
  if (!token) return false;
  const validos = ["CRON_SECRET", ...extraEnv]
    .map((k) => process.env[k])
    .filter((v): v is string => !!v && v.length >= 16);
  return validos.includes(token);
}
