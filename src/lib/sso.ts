// Sesión compartida con la nómina (SSO): la nómina firma un pase corto (JWT)
// con el secreto compartido SSO_SECRET; aquí se verifica y se emite la cookie
// de sesión propia. Nadie entra al conciliador sin pasar por la nómina.
import { SignJWT, jwtVerify } from "jose";

const COOKIE = "pz_conciliador";
const AUDIENCE = "conciliador-plazet";
const DIAS_SESION = 30;

function secreto(): Uint8Array {
  const s = process.env.SSO_SECRET;
  if (!s) throw new Error("Falta SSO_SECRET en las variables de entorno");
  return new TextEncoder().encode(s);
}

export interface SesionUsuario {
  email: string;
  name: string;
}

/** Verifica el pase corto que emite la nómina (válido pocos minutos) */
export async function verificarPase(token: string): Promise<SesionUsuario> {
  const { payload } = await jwtVerify(token, secreto(), { audience: AUDIENCE });
  return { email: String(payload.email ?? ""), name: String(payload.name ?? "") };
}

/** Emite la cookie de sesión del conciliador (30 días) */
export async function emitirSesion(u: SesionUsuario): Promise<string> {
  return new SignJWT({ email: u.email, name: u.name })
    .setProtectedHeader({ alg: "HS256" })
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${DIAS_SESION}d`)
    .sign(secreto());
}

/** Valida la cookie de sesión; null si falta o no es válida */
export async function validarSesion(cookie: string | undefined): Promise<SesionUsuario | null> {
  if (!cookie) return null;
  try {
    const { payload } = await jwtVerify(cookie, secreto(), { audience: AUDIENCE });
    return { email: String(payload.email ?? ""), name: String(payload.name ?? "") };
  } catch {
    return null;
  }
}

export const SESSION_COOKIE = COOKIE;
