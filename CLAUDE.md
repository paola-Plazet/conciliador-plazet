@AGENTS.md

# Conciliador Plazet

Herramienta de conciliación de **efectivo** y **datáfono** para HABBIE SAS (5 tiendas Plazet).
Compara las ventas del POS (Alegra) contra las consignaciones del banco y los recaudos del datáfono.

## Comandos

```bash
npm run dev          # Servidor de desarrollo (Turbopack)
npm run build        # prisma generate + next build
npm run db:push      # Aplica el schema a SQLite
npm run db:seed      # Siembra tiendas + festivos Colombia 2025-2027
```

Scripts de validación (en `scripts/`): `test-parsers.ts`, `test-engine.ts`, `test-late.ts`.

## Stack

Next.js 16 (App Router, Turbopack), React 19, TypeScript, Prisma 7 + SQLite (adapter
better-sqlite3), TailwindCSS 4, lucide-react. Lectura de Excel/CSV con `xlsx` y `csv-parse`.

> ⚠️ Next.js 16: `params`/`searchParams` son **async**. Turbopack por defecto. `next lint`
> eliminado (usar `eslint`). Ver `node_modules/next/dist/docs/` ante dudas de API.

## Arquitectura

### Núcleo de negocio (`src/lib/`)
- `types.ts` — tipos del dominio (SaleInvoice, BankCashEntry, DataphoneEntry, ConciliationResult, StoreAlert)
- `stores.ts` — definición de las 5 tiendas + mapeo bodega/establecimiento → tienda
- `holidays.ts` — festivos colombianos calculados (Ley Emiliani + Pascua)
- `dates.ts` — días hábiles, `expectedSalesDays`, `businessDaysBetween` (atraso)
- `money.ts` — formato COP + tolerancia (±$500)
- `engine.ts` — **motor de conciliación** (ver abajo)
- `parsers/` — `alegra.ts` (CSV Latin1, dedup por factura), `banco.ts` (XLS efectivo),
  `datafono.ts` (XLSX conciliar), `detect.ts` (autodetección), `util.ts`
- `process.ts` — orquesta parsers + config (refMap, festivos) + motor; `recompute()` para ajustes

### Motor (`engine.ts`)
- **Canal EFECTIVO**: calce secuencial por tienda. Cada consignación acumula 1..6 días de
  venta pendientes hasta cuadrar dentro de tolerancia. Maneja fines de semana y festivos
  (lunes = vie+sáb+dom). Detecta **atraso**: una consignación tardía igual concilia (CUADRA)
  pero marca `daysLate`/`late`. Genera `StoreAlert.recurrent` si una tienda es reincidente.
- **Canal DATAFONO**: comparación directa por tienda y día (ventas tarjeta POS vs bruto datáfono).
- Consciente de rangos: marca "fuera de rango" en vez de falso descuadre cuando un archivo
  no cubre cierta fecha.

### Datos (Prisma `schema.prisma`)
`Store`, `CashReference` (referencia banco → tienda), `Holiday`, `Run` (corrida con JSON de
ventas/banco/datáfono/resultados/ajustes). Cliente generado en `src/generated/prisma/`.

### API (`src/app/api/`)
- `POST /api/process` — sube archivos (multipart), autodetecta, concilia, persiste `Run`
- `GET /api/runs`, `GET|DELETE /api/runs/[id]`, `GET /api/runs/[id]/export` (Excel)
- `POST /api/runs/[id]/adjust` — ajuste manual + recálculo
- `GET|POST /api/config/references`, `GET|POST|DELETE /api/config/holidays`, `GET /api/config/stores`

### Páginas (`src/app/`)
`/` tablero · `/cargar` carga · `/conciliacion` detalle + ajuste manual · `/configuracion`
mapeo referencias + festivos · `/reportes` historial + exportar.

## Estado actual (jul 2026)

- **Fuente de ventas preferida**: reporte de **Transacciones** de Alegra (XLSX, kind `alegra_trans`,
  parser `alegra-trans.ts`). Tienda por cuenta "Efectivo POS - ..." o prefijo de factura
  (B1/B2/B3/C1→JP; P#### = página web, sin tienda). El reporte de Facturas (CSV) sigue soportado.
- **Canal QR**: el CSV 191 del banco datáfono se parsea (`datafono-banco.ts`, filas "PAGO QR")
  y se cruza contra ventas "QR Bancolombia" por día a nivel empresa (el banco no trae tienda).
- **Alerta "¿QR?"** (`annotateQrDiversion` en engine.ts): cuando a una consignación de efectivo
  le falta plata y ese valor exacto entró como PAGO QR esos días, se marca `qrAlert` + nota con
  el nombre del pagador. Hallazgo real validado con junio 2026 (Plaza: 7 casos exactos).
  Es un error de procedimiento de las asesoras; NO se cuadra automático.
- **Banco efectivo**: soporta el formato Alianza ("Fecha Tran", fechas serial Excel) además del XLS viejo.
- Referencias sembradas (`scripts/seed-references.ts`) desde el cruce manual de Paola:
  3235896844/3138845101→B3, 3105543462→B2, 3015140002/3102874360→B1, 3172560775→JP.
  Quedan ~5 refs sin asignar en el extracto (ej. 3209052268, 3111234598, 3203518392).
- Scripts de validación: `test-trans.ts`, `test-junio.ts`, `test-plaza.ts`, `seed-run-junio.ts`
  (usan archivos reales en Downloads y la hoja ALIANZA EFECTIVO de Escritorio/conciliacion.xlsx).
- La app corre en puerto **3001** si la nómina ocupa el 3000.

### PENDIENTE: reporte diario por correo (acordado con Paola, jul 2026)
Reporte de pendientes por consignar por punto + estado por método de pago (ok/diferencia):
- Consolidado de todas las tiendas → Jerónimo; reporte individual de cada tienda → sus asesoras.
- Envío por **Gmail de Habbie** (SMTP con contraseña de aplicación — falta que Paola la genere).
- Disparo con **botón manual** tras cargar los archivos del día.
- Destinatarios **configurables en /configuracion** (correo Jerónimo + correos de asesoras por tienda).

## Reglas de negocio clave
- Las 4-5 tiendas consignan **efectivo** a una cuenta y los **datáfonos** a otra.
- Regla: se consigna el efectivo del día anterior hábil; finde/festivo se acumula.
- El **mapeo referencia-banco → tienda** lo asigna el usuario en Configuración (no se puede
  inferir por monto, porque la cuenta recibe más que ventas: transferencias, aportes, etc.).
- Mapeo datáfono por `CODIGO ESTABLECIMIENTO` (confiable): 31002587=B1, 31002660=B2,
  31002645=B3, 31014111=Principal, 31029473=Jardín Plaza.

## Branding
Verde Plazet `#3ba55d` (paleta `plazet-50`…`plazet-950` en `globals.css`). Fuente Inter.
