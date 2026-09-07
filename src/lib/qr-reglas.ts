// Reglas del canal QR (compartidas por el tablero y el detalle por día).

/** Un pago QR del banco puede ser hasta N días ANTERIOR a la factura (venta
 * registrada tarde / web facturada a la mañana siguiente), NUNCA posterior.
 * Regla de Paola (07-sep-2026): "los QR no pueden entrar en una fecha posterior
 * a la facturada". */
export const QR_DIAS_ANTES = 2;
