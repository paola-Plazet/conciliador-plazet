// Definición de las tiendas de Habbie y utilidades de mapeo.
// Mapeo de terminales del datafono CONFIRMADO por el cliente.

export interface StoreDef {
  code: string; // identificador interno
  name: string;
  alegraBodega: string; // texto EXACTO de la columna BODEGA en Alegra
  establishment: string; // CODIGO ESTABLECIMIENTO del datafono
  terminalVisa: string;
  terminalMaster: string;
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
  STORES.map((s) => [s.establishment, s.code]),
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
