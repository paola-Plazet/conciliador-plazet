// Definición de las tiendas de Habbie y utilidades de mapeo.
// Mapeo de terminales del datafono CONFIRMADO por el cliente.

/** Contrato con el centro comercial (tiendas con recaudo CENTRO_COMERCIAL):
 * el centro comercial liquida el arriendo por corte de 10 días y lo descuenta
 * del giro. Valores sin IVA. */
export interface ContratoCentroComercial {
  ubicacion: string;
  /** cuota mínima por corte (decadal), sin IVA */
  cuotaMinimaDecadal: number;
  /** canon variable sobre las ventas reportadas (0.13 = 13 %); se cobra el mayor entre mínimo y variable */
  variablePct: number;
  /** publicidad sobre las ventas reportadas (0.01 = 1 %), se suma siempre */
  publicidadPct: number;
  /** IVA sobre canon y publicidad (0.19) */
  ivaPct: number;
}

export interface StoreDef {
  code: string; // identificador interno
  name: string;
  alegraBodega: string; // texto EXACTO de la columna BODEGA en Alegra
  establishment: string; // CODIGO ESTABLECIMIENTO del datafono
  terminalVisa: string;
  terminalMaster: string;
  /** Modalidad de recaudo. Sin valor = la tienda consigna su efectivo y tiene
   * datáfono propio. CENTRO_COMERCIAL = la caja es del centro comercial: él
   * recauda efectivo + datáfono, corta cada 10 días y paga 2-3 días hábiles
   * después (ver centro-comercial.ts). El QR sí entra a Bancolombia. */
  recaudo?: "CENTRO_COMERCIAL";
  /** solo CENTRO_COMERCIAL: cómo liquida el arriendo que descuenta de cada corte */
  contratoCC?: ContratoCentroComercial;
}

export const STORES: StoreDef[] = [
  {
    code: "B1",
    name: "Plaza de las Américas",
    alegraBodega: "PLAZET PLAZA DE LAS AMERICAS",
    establishment: "31002587",
    terminalVisa: "BHV9P",
    terminalMaster: "000BHV9P",
  },
  {
    code: "B2",
    name: "Unioccidente",
    alegraBodega: "PLAZET UNIOCCIDENTE",
    establishment: "31002660",
    terminalVisa: "BHV9Q",
    terminalMaster: "000BHV9Q",
  },
  {
    code: "B3",
    name: "Unicentro Norte",
    alegraBodega: "PLAZET UNICENTRO",
    establishment: "31002645",
    terminalVisa: "BHV9M",
    terminalMaster: "000BHV9M",
  },
  {
    code: "PRIN",
    name: "Principal",
    alegraBodega: "PRINCIPAL",
    establishment: "31014111",
    terminalVisa: "BHXZQ",
    terminalMaster: "000BHXZQ",
  },
  {
    code: "JP",
    name: "Jardín Plaza",
    alegraBodega: "PLAZET JARDIN PLAZA",
    establishment: "31029473",
    terminalVisa: "BI3R1",
    terminalMaster: "000BI3R1",
  },
  // Floresta (Bogotá), abiertas en sep-2026: la caja es del centro comercial.
  // Sin datáfono propio ni referencia de consignación. B5 = local frente a
  // Colfondos; B6 = isla (burbuja) junto a la Droguería Comercial Cafam
  // (Karrot la manda como "B4": el parser la mapea a B6). Contrato Floresta
  // (Paola 11-sep): canon = mayor entre la cuota mínima decadal y el 13 % de
  // las ventas reportadas, + publicidad 1 %, + IVA 19 %; el centro comercial
  // lo descuenta del giro de cada corte, que entra a Bancolombia.
  {
    code: "B5",
    name: "Floresta",
    alegraBodega: "PLAZET FLORESTA",
    establishment: "",
    terminalVisa: "",
    terminalMaster: "",
    recaudo: "CENTRO_COMERCIAL",
    contratoCC: { ubicacion: "Local frente a Colfondos", cuotaMinimaDecadal: 1776337, variablePct: 0.13, publicidadPct: 0.01, ivaPct: 0.19 },
  },
  {
    code: "B6",
    name: "Floresta Isla",
    alegraBodega: "PLAZET BURBUJA FLORESTA",
    establishment: "",
    terminalVisa: "",
    terminalMaster: "",
    recaudo: "CENTRO_COMERCIAL",
    contratoCC: { ubicacion: "Isla junto a la Droguería Comercial Cafam", cuotaMinimaDecadal: 1152849, variablePct: 0.13, publicidadPct: 0.01, ivaPct: 0.19 },
  },
];

/** Normaliza texto: mayúsculas, sin acentos, sin espacios extra */
export function normalize(text: string): string {
  return (text ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
}

const BODEGA_INDEX = new Map(
  STORES.map((s) => [normalize(s.alegraBodega), s.code]),
);
const ESTABLISHMENT_INDEX = new Map(
  STORES.filter((s) => s.establishment).map((s) => [s.establishment, s.code]),
);

/** Resuelve el código de tienda a partir de la bodega de Alegra */
export function storeFromBodega(bodega: string): string | null {
  return BODEGA_INDEX.get(normalize(bodega)) ?? null;
}

/** Resuelve el código de tienda a partir de la cuenta contable del reporte de
 * transacciones de Alegra (p.ej. "Efectivo POS - PLAZET UNICENTRO",
 * "Efectivo POS - Terminal PLAZET JARDIN PLAZA"): busca el nombre de la
 * bodega dentro del texto de la cuenta. */
export function storeFromCuenta(cuenta: string): string | null {
  const n = normalize(cuenta);
  // ordenar por longitud descendente para evitar coincidencias parciales
  const defs = [...STORES].sort(
    (a, b) => b.alegraBodega.length - a.alegraBodega.length,
  );
  for (const s of defs) {
    if (n.includes(normalize(s.alegraBodega))) return s.code;
  }
  return null;
}

// Prefijo de numeración de factura -> tienda (confirmado con el cruce manual
// de Paola: B1 Plaza, B2 Unioccidente, B3 Unicentro, C1 Jardín Plaza,
// P#### = página web, sin tienda física).
const PREFIX_INDEX = new Map<string, string>([
  ["B1", "B1"],
  ["B2", "B2"],
  ["B3", "B3"],
  ["C1", "JP"],
  ["B4", "B6"], // Karrot codifica B4 la isla de Floresta; para Paola es B6
  ["B5", "B5"],
  ["B6", "B6"],
]);

/** Resuelve tienda a partir del número de factura (p.ej. "B33048" -> B3).
 * Los códigos P#### (página web) devuelven null. */
export function storeFromInvoicePrefix(invoice: string): string | null {
  const m = String(invoice).trim().toUpperCase().match(/^([A-Z]\d)/);
  if (!m) return null;
  return PREFIX_INDEX.get(m[1]) ?? null;
}

/** Resuelve el código de tienda a partir del CODIGO ESTABLECIMIENTO del datafono */
export function storeFromEstablishment(est: string): string | null {
  return ESTABLISHMENT_INDEX.get(String(est).trim()) ?? null;
}

export function storeName(code: string | null): string {
  if (!code) return "Sin asignar";
  return STORES.find((s) => s.code === code)?.name ?? code;
}

/** ¿El efectivo y el datáfono de esta tienda los recauda el CENTRO COMERCIAL
 * (cortes cada 10 días)? Ver centro-comercial.ts */
export function esCentroComercial(code: string | null | undefined): boolean {
  return !!code && STORES.some((s) => s.code === code && s.recaudo === "CENTRO_COMERCIAL");
}

