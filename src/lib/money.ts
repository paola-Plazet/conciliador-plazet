// Utilidades de dinero (pesos colombianos)

/** Redondea a pesos enteros */
export function toPesos(n: number): number {
  return Math.round(n);
}

/** Formatea como moneda colombiana: $1.234.567 */
export function formatCOP(n: number): string {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(Math.round(n));
}

/** Tolerancia por defecto para considerar que un depósito "cuadra" (pesos) */
export const DEFAULT_TOLERANCE = 500;

/** ¿Dos montos cuadran dentro de la tolerancia? */
export function within(a: number, b: number, tolerance = DEFAULT_TOLERANCE): boolean {
  return Math.abs(Math.round(a) - Math.round(b)) <= tolerance;
}
