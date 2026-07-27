// Tipos compartidos del dominio de conciliación

/** Medios de pago normalizados (desde Alegra) */
export type PaymentMethod =
  | "EFECTIVO"
  | "TARJETA_CREDITO"
  | "TARJETA_DEBITO"
  | "TRANSFERENCIA"
  | "OTRO";

/** Canal de conciliación: contra qué cuenta se concilia */
export type Channel = "EFECTIVO" | "DATAFONO" | "QR";

/** Una venta (factura) deduplicada de Alegra */
export interface SaleInvoice {
  invoice: string; // número de comprobante (B1651...)
  date: string; // YYYY-MM-DD (fecha de emisión)
  bodega: string; // texto crudo de la bodega Alegra
  storeCode: string | null; // resuelto a código de tienda
  method: PaymentMethod;
  amount: number; // TOTAL - FACTURA
}

/** Un movimiento del extracto de la cuenta de EFECTIVO */
export interface BankCashEntry {
  date: string; // YYYY-MM-DD
  concept: string;
  amount: number; // positivo = ingreso, negativo = egreso
  reference: string | null; // referencia RECAUDO REFE si aplica
  storeCode: string | null; // resuelto vía CashReference
  kind: "RECAUDO_EFECTIVO" | "CONSIG_TRANSFER" | "OTRO";
}

/** Una transacción individual del reporte de datafono (Conciliar) */
export interface DataphoneEntry {
  txDate: string; // YYYY-MM-DD fecha de transacción (venta)
  depositDate: string; // YYYY-MM-DD fecha de canje (consignación)
  establishment: string; // CODIGO ESTABLECIMIENTO
  storeCode: string | null;
  franchise: string; // VISA / MASTERCARD
  cardType: string; // CREDITO/DEBITO ...
  gross: number; // VALOR TOTAL (bruto, compara vs POS)
  net: number; // VALOR NETO (neto, llega al banco)
  terminal: string; // NO TERMINAL
}

/** Un abono/movimiento del extracto de la cuenta del DATAFONO (CSV 191).
 * Se usan principalmente los PAGO QR; los abonos de tarjeta llegan netos
 * (con comisión descontada) y se concilian vía el reporte Conciliar. */
export interface QrBankEntry {
  date: string; // YYYY-MM-DD
  concept: string; // "PAGO QR MARIA JOSE ..." (trae el nombre, no la tienda)
  amount: number;
  payer: string; // nombre que acompaña el PAGO QR
}

/** Estado de una conciliación */
export type ConciliationStatus =
  | "CUADRA" // diferencia dentro de tolerancia
  | "DIFERENCIA" // diferencia pequeña
  | "SIN_CONCILIAR" // no se halló combinación
  | "MANUAL"; // ajustado manualmente

/** Resultado de conciliación de un depósito contra ventas */
export interface ConciliationResult {
  id: string; // id estable para ajustes
  channel: Channel;
  storeCode: string | null;
  storeName: string;
  method: PaymentMethod | "TARJETAS" | "QR";
  depositDate: string; // fecha del depósito en el banco
  depositAmount: number; // monto del depósito (o suma de abonos del día)
  salesDates: string[]; // días de venta que cubre
  salesAmount: number; // suma de ventas de esos días
  difference: number; // depositAmount - salesAmount
  status: ConciliationStatus;
  note?: string;
  // Control de oportunidad (solo canal EFECTIVO)
  expectedDate?: string; // día hábil en que se esperaba la consignación
  daysLate?: number; // días hábiles de atraso (0 = a tiempo)
  late?: boolean; // true si se consignó tarde (aunque cuadre)
  // Alerta: el faltante de efectivo aparece como pago QR en la otra cuenta
  qrAlert?: boolean;
  // Mes de conciliación al que pertenece (YYYY-MM): el de las ventas que
  // cubre; si no cubre ninguna, el del depósito
  month?: string;
}

/** Días de venta en efectivo aún sin consignación que los cubra */
export interface PendingDeposit {
  storeCode: string | null;
  storeName: string;
  days: { date: string; amount: number }[]; // días pendientes con su venta
  total: number; // suma de ventas en efectivo de esos días
}

/** Alerta a nivel de tienda por consignaciones tardías recurrentes */
export interface StoreAlert {
  storeCode: string | null;
  storeName: string;
  channel: Channel;
  lateCount: number; // consignaciones tardías
  totalCount: number; // consignaciones conciliadas
  latePct: number; // % de tardías
  maxDaysLate: number;
  avgDaysLate: number;
  recurrent: boolean; // true si supera el umbral de reincidencia
}

/** Ajuste manual hecho por el usuario */
export interface ManualAdjustment {
  resultId: string;
  salesDates: string[]; // días asignados manualmente
  note: string;
}
