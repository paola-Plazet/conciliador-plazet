# Estado de la APP y el TABLERO — retomar aquí

Última sesión: 11-sep-2026. Retomar con:
**"retomemos el conciliador, lee docs/estado-app-tablero.md"**

## 11-sep-2026 — datáfono: diferencia NETA en la tabla + tasa Credibanco verificada

**Tabla /tiendas (FilaDia):** la columna de diferencia del datáfono ya no muestra "falta X / sobra Y"
apilados sino la DIFERENCIA NETA del día (falta − sobra): rojo "falta", ámbar "sobra", verde "cuadra"
(con "(±X)" gris si falta y sobra se compensaron). El cruce sigue siendo exacto transacción por
transacción (`datafono-cruce.ts`) y el modal al clic en la venta sigue mostrando cuáles faltan y
cuáles entraron de más. El triángulo de alerta también usa el neto. Pedido de Paola (11-sep).
Desplegado el 11-sep (commit 1835624 + scripts en el siguiente).

**Tasa Credibanco (scripts `datafono-tasa.ts`, `datafono-tasa2.ts`, `datafono-lag-aut.ts`, solo
lectura):** el descuento por transacción es EXACTO y constante: comisión **1,99 %** (no 1,89 %) +
retefuente 1,5 % + reteICA 0,414 % Bogotá (B1/B2/B3) ó 0,7 % Cali (JP) = neto 96,096 % / 95,81 %.
Sin IVA ni 4x1000 en el abono (columnas VALOR RETE IVA y PROVISION = 0 en el "Reporte Tarjeta
Original" de Conciliar). 172/172 lotes (día de venta + terminal + franquicia) coinciden al peso con
los "ABONO NETO VISA/MASTER/AMEX" de Bancolombia; rezago 1 día hábil (lunes = vie+sáb+dom). **Cuándo publica Conciliar** (medido con 20 descargas de Downloads, fecha de descarga vs última transacción): las transacciones del día D salen en el reporte el día hábil siguiente y en la TARDE (descargas de lunes a las 10:30-15:30 nunca traen el viernes ni el fin de semana; descargas de 16:00 en adelante sí traen el día anterior). Por eso un pago del viernes 'aparece' el lunes por la noche (3 días) y con festivo el martes (4 días): bajar el reporte en la noche. Por código
de autorización, 3.192 pagos POS↔Conciliar con 0 días de diferencia (la fecha del datáfono es la del
POS). Karrot marca "AMEX" en muchos pagos que en Conciliar son Visa/MC (solo 4 AMEX reales en 3 sem.).

## 11-sep-2026 — Floresta (B4/B5, recaudo por CENTRO COMERCIAL) + todo automático

**Tiendas nuevas (Paola 10-sep):** `B4 Floresta Burbuja` (PLAZET BURBUJA FLORESTA) y `B5 Floresta`
(PLAZET FLORESTA), códigos = "Código Almacén" de Karrot. En `stores.ts` con `recaudo: "CENTRO_COMERCIAL"`,
sin datáfono propio ni referencia de consignación (sembradas en la tabla Store con `seed.ts`).

**Regla del centro comercial (Paola):** la caja es del centro comercial: recauda TODO el efectivo y el
datáfono, hace cortes cada 10 días (1–10, 11–20, 21–fin de mes) y paga 2-3 días hábiles después. El QR sí
entra a Bancolombia (canal QR normal). Implementado en `src/lib/centro-comercial.ts` (`calcularCortesCC`):
- el motor (`engine.ts`) saca las ventas EFECTIVO/TARJETA de esas tiendas de los canales efectivo y
  datáfono y arma cortes por tienda; canal nuevo `CENTRO_COMERCIAL` en `types.ts`;
- por cada corte busca UN abono por el total (±$500) entre el día siguiente al corte y
  `CC_VENTANA_HABILES = 6` hábiles, en Alianza (abonos que no son RECAUDO REFE) y en Bancolombia
  (abonos que no son PAGO QR/LLAVE); también acepta un pago CONJUNTO B4+B5 del mismo corte y, si no
  calza el valor, un rótulo con "FLORESTA" (queda DIFERENCIA);
- estados: EN_PLAZO (aún no se exige; no entra a resultados) · CUADRA · DIFERENCIA · VENCIDO
  (SIN_CONCILIAR si el extracto ya pasó el límite sin pago). Pago esperado = corte + 3 hábiles;
- los abonos usados se quitan del cruce QR (`pagosCC`) para no contarlos como pagos de clientes;
- tablero: tarjeta "Centro comercial (efectivo + datáfono)" en vez de Efectivo/Datáfono, tabla
  "Cortes del centro comercial", los días marcan "→ centro comercial"; /resumen fila "Centro
  comercial"; /conciliacion filtro "Centro comercial". Probado con datos sintéticos (exacto, conjunto,
  vencido, en plazo). **SUPUESTOS por confirmar con el primer pago real:** llega completo (sin comisión)
  y a Alianza o Bancolombia; si no, ajustar `centro-comercial.ts`. Al 10-sep solo hay 2 ventas QR.

**Automático (Paola: "haz que todo sea automático"):**
- `vercel.json` cron diario 09:00 UTC (04:00 Colombia) → `GET /api/cron/sync` (bearer `CRON_SECRET`,
  env en Vercel Production y en .env): corre en paralelo Shopify + Mercado Pago + Alegra (mes en curso;
  los 5 primeros días también el anterior). Lógica compartida en `src/lib/sync.ts` (el botón de /web usa
  lo mismo). Probado local: ~53 s → `maxDuration = 300`.
- `POST /api/cron/karrot` (bearer `KARROT_PUSH_TOKEN` o CRON_SECRET; cuerpo = CSV del conector, tolera
  el prefijo "[Resource from ...]"): lo carga por `ingestFiles` (replace-range) y responde por día.
- **Rutina de Claude (claude.ai/code/routines)** diaria 09:15 UTC con el conector Karrot: pide
  `ALL_SALES_DETAIL_PAYMENT_METHOD` de los últimos 3 días completos (ventana grande para que el MCP lo
  guarde en archivo y no haya que transcribir), y lo empuja con curl al endpoint. Cargar 3 días cada vez
  es idempotente y cura días que quedaron a medias.
- Si algo falla: logs de la rutina en claude.ai/code/routines; cron en Vercel → Logs; el tablero muestra
  hasta qué fecha llegó cada fuente (cortes).

## 10-sep-2026 — Karrot por CONECTOR (sin bajar el allsales) + 7-sep estaba incompleto

**Por qué "no cargaba" Karrot:** las ventas Karrot NO entran por API ni por el botón "Sincronizar"
de /web (ese botón solo trae Shopify + Mercado Pago + Alegra). Entran únicamente por el archivo
allsales que Paola sube en /cargar, y el último fue el del 7-sep (generado a las 17:15) → la base
quedó en 7-sep y, además, ese día quedó INCOMPLETO (106 pagos hasta las 17:00 en vez de 154: faltaban
~$2,3M de la tarde-noche). Regla: un allsales generado a media tarde deja el día en curso a medias;
al día siguiente hay que recargar ese día (replace-range lo reemplaza).

**Solución:** el conector MCP de Karrot (`generate-report` tipo `ALL_SALES_DETAIL_PAYMENT_METHOD`,
startDate/endDate en UTC = día Colombia + 05:00Z) entrega EXACTAMENTE el reporte "una fila por pago"
con encabezados en inglés (`Invoice #`, `Warehouse Code/Name`, `Canceled`, `Date`, `Hour`,
`Payment Method Name/Value`, `CodigoAutorizacion`, `CuatrosDigitos`, `Franquicia`, `TipoCuenta`).
`parseKarrotPagos` ahora acepta ese CSV (csv-parse, alias en inglés, "Yes" = anulada) y
`detect.ts` lo reconoce como `karrot_pagos` → se carga por /cargar o por
`npx tsx scripts/cargar-archivo.ts <csv>`. La respuesta del MCP (>30 KB) queda guardada en un
archivo de tool-results; quitarle el prefijo `[Resource from ...] ` de la primera línea y cargar.
Cargado 7→10-sep (589 pagos: 7-sep $7.770.781 · 8 $12.021.681 · 9 $5.610.395 · 10 $7.867.250).

**Ventas web:** en /web Shopify + MP sí estaban al día (sync del 10-sep 23:06). Lo que "no se
actualizaba" eran las ventas web dentro del tablero/resumen, que salen de KARROT (facturas de Elba,
almacén PRINCIPAL, método Mercadopago) — se destraba con la misma carga de Karrot.

**Nuevos almacenes en Karrot (10-sep):** `B4 PLAZET BURBUJA FLORESTA` y `B5 PLAZET FLORESTA`
(1 venta cada uno, vendedor Jerónimo). No están en `CODIGO_TIENDA` ni en `stores.ts` → quedan
"sin tienda". Definir con Paola si son tiendas nuevas (datáfono, terminal, extracto).

**Pendiente:** no hay sincronización automática de nada (ni cron en Vercel ni rutina): Shopify/MP/
Alegra dependen del botón de /web y Karrot de una carga (archivo o conector vía Claude).

## 07-sep-2026 — regla de fecha QR + notas compartidas con fotos de comprobantes

**Regla QR (Paola):** un pago QR del banco NUNCA es posterior a la fecha facturada; puede ser del mismo
día o hasta `QR_DIAS_ANTES = 2` días antes (`src/lib/qr-reglas.ts`, usada por `/api/dashboard` y `/api/qr-dia`).
Antes el cruce admitía ±6 días en ambas direcciones y un pago de $74.600 del 5-may se "comía" la venta
de $74.450 de Plaza del 8-may (la dif del día salía 82.450 en vez de 82.600 + 74.450 = 157.050).
Verificado con la ruta real (`scripts/dash-qr-meses.ts`): jun/jul/ago/sep quedaron IGUAL; mayo B1 pasa a
$1.251.400 (9 días) y B2 $1.363.288 — el hueco viejo de mayo, 26 ventas QR sin pago (ver abajo).
Por revisar queda solo el $35.650 del 7-may (Plaza/Unioccidente); el $35.500 del 8-may ya no se ofrece
como candidato del 35.650 del 7 (sería un pago posterior) y queda "sin asignar" a nivel empresa.

**Reclasificación por Alegra en mayo = 0** (`scripts/qr-mayo-alegra.ts`, `alegra-rappi-mayo.ts`): los 8
pagos Rappi/Addi de mayo en Alegra corresponden a ventas que Karrot YA trae como método OTRO/Rappi, no
como QR → los 26 QR de mayo sin pago ($2,54M: B1 11 · B2 15) son reales, no un error de método.

**CRUCE CON LA LIQUIDACIÓN DE RAPPI (noche del 07-sep)**: Jerónimo dejó notas (tabla DayNote) diciendo
que varias ventas QR de Plaza en mayo fueron Rappi. Paola bajó `Downloads/report.xlsx` = liquidación
Rappi 23661380 (4–10 may, **cuenta de COMERCIALIZADORA NATURAL LIGHT** — la plata de Rappi de las
tiendas Plazet entra a NL, no a Habbie; hoja "1. Ventas por Orden": STORE ID 900170757 = Plaza,
"Plazet, Unicentro Occidente" = B2). Cruce (`scripts/rappi-report.ts`, `rappi-cruce-mayo.ts`):
SÍ existen en Rappi y estaban como QR → **reclasificadas a Rappi** (`scripts/reclasificar-rappi-mayo.ts`):
B1 7-may fac 527 $20.600 y fac 545 $35.650, 8-may fac 727 $74.450, 9-may fac 791 $20.750; B2 7-may
fac 502 $107.250 y fac 505 $69.650, 9-may fac 801 $37.950. NO existe en Rappi: B1 9-may $85.800 (Jero
dice Rappi; queda pendiente). B1 11-may $239.750 = Addi (fuera de este archivo). B1 8-may $82.600 = DOS
QR de MICHEL CASTRO (47.100 + 35.500, ambos en el banco el 8-may) → nuevo PASE 3 del cruce QR (pares
del mismo pagador). Mayo pasa de 26 a 18 QR sin pago ($2,18M) y el empate 35.650 del 7-may se resolvió
solo (el de Plaza era Rappi → el del banco es de Unioccidente). Órdenes Rappi de Plazet SIN venta en el
POS: B1 4-may $20.600, 5-may $102.300, 9-may $91.950 (cash); B2 7-may $18.150 (¿la de $18.500 QR?).
**Todas las liquidaciones** (`scripts/rappi-cruce-todos.ts [--aplicar]`; Paola bajó 7 = `report (1..7).xlsx`,
los `download (N).xlsx` son copias idénticas): 1–5 abr, 6–12 abr, 27–30 abr, 1–3 may, 4–10 may, 11–17 may,
18–24 may (faltan 13–26 abr y todo desde el 25-may). Resultado: 18 ya eran Rappi en el POS, 9 reclasificadas
(las 7 de arriba + B2 11-may fac 952 $21.450 + B1 14-may fac 1275 $35.650 → mayo queda en 16 QR sin pago),
4 en Linux como EFECTIVO (abril, cerrado; B1 27-abr $59.300 y 29-abr $71.300 son era Habbie), y 43 órdenes
SIN venta en el POS — en era Habbie: B1 27-abr $50.600 y $53.300, 28-abr $142.600, 29-abr $76.800, 2-may
$106.950, 4-may $20.600, 5-may $102.300, 9-may $91.950; B2 30-abr $102.300, 7-may $18.150, 20-may $79.700 y
$12.800 (≈$960K de mercancía que salió por Rappi sin factura en el POS, o facturada otro día/valor → revisar
con Jerónimo). Tiendas "Plazet, C.C Viva Envigado" y "Plazet, Éxito Occidente" en los archivos = tiendas de NL.
**Cruce INVERSO** (`scripts/rappi-verificar-pos.ts`, pedido de Paola: "lo que en Linux estaba como Rappi,
¿existe en las liquidaciones?"): 41 ventas POS como Rappi abr–may → 20 exactas ✓, **9 con la orden el mismo
día por 350/600/900 menos** (Rappi liquida unos pesos menos que el precio del POS: patrón repetido → reales),
6 sin liquidación (24–26 abr: falta bajar el pago 23401032 "20–26 abr", está en el Historial de Pagos), 6 que
NO están: B1 27-abr $57.300 (Linux; la orden suelta de $53.300 cc ese día podría ser, dif 4.000) y 5 de Alegra
bodega "Rappi / Addi" de montos grandes (B1 6-may $193.500, B3 6-may $310.700, B1 14-may $310.900, B3 14-may
$53.300, B1 22-may $184.400) = casi seguro **Addi**. Con el patrón -350 se marcaron Rappi 3 QR más de B2
(`scripts/reclasificar-rappi-aprox.ts`): 7-may fac 552 $18.500 (orden $18.150), 20-may fac 1904 $80.050
($79.700) y fac 1947 $13.150 ($12.800) → mayo queda en 13 QR sin pago. Órdenes Rappi sin nada en el POS:
B1 27-abr $53.300 cc y B1 9-may $91.950 cash.

**REGLA DE NEGOCIO (Paola, 07-sep): Rappi Y ADDI los recauda NATURAL LIGHT, por ahora.** Las
liquidaciones de ambas plataformas por ventas de tiendas Plazet entran a las cuentas de NL, no a Habbie.
En el conciliador son canales informativos (sin archivo de recaudo); las tarjetas de /tiendas lo dicen.
Si cambia (Habbie abre su propia cuenta Rappi/Addi), habrá que cargar sus liquidaciones y cruzarlas.

**QR CONTABILIZADOS COMO EFECTIVO (Alegra)** — Paola: "el efectivo del 16 y 17 no me suma; la columna
Método dice Transferencia y la cuenta dice Efectivo POS". En el reporte de transacciones hay **23 filas de
Plaza (16-may → 22-jun, $1.844.620)** con cuenta "Efectivo POS - PLAZET PLAZA" y método "Transferencia": son
QR que la asesora contabilizó en la caja; TODOS aparecen en el banco como PAGO QR (`scripts/alegra-trans-cuenta-vs-metodo.ts`,
`qr-en-efectivo-check.ts`). Fix en `alegra-trans.ts` `classify()`: en cuenta Efectivo POS manda el MÉTODO
(Transferencia → canal QR). Reporte recargado (`cargar-archivo.ts`): B1 15–18 may pasa de −$175.700 a
CUADRA; junio QR "sin asignar" baja de $1,71M a $194K. Notas 📝 "QR mal clasificado: …" creadas por
día/tienda (17, autor Claude) con factura, valor y pagador del banco (`scripts/notas-qr-mal-clasificado.ts`,
idempotente). OJO: al recargar Alegra los números de factura cambiaron (comprobante "527" → factura "B1240")
y las reclasificaciones Rappi dejaron de calzar → `aplicarOverrides()` ahora se AUTOCORRIGE (busca por
fecha/tienda/valor/método original y adopta el número nuevo si hay una sola candidata); las 12 quedaron bien.

Ampliación: la misma regla aplica a la cuenta **"Caja Menor PLAZET …"** (9-may Plaza $124.350 fac B198 =
QR de Diana Camila; salía como "Otros") y a las cuentas de banco **Alianza / Bancolombia AH 3911** con
método Transferencia **y factura de tienda (B…)** (5-may 4 casos en Alianza, 8–10 jul 19/19 en 3911; sin
factura de tienda son descuentos de proveedores → siguen OTRO). `classify(cuenta, metodo, factura)`.
Total 28 QR mal clasificados con nota. Paola ya usó los botones "fue Rappi/Addi" del detalle QR: overrides
#13–#18 (B1 11-may $239.750, 10-may $85.150, 16-may $406.750, 22-may $96.700, 27-may $67.550 → Addi; 9-may
$85.800 → Rappi) → **Plaza mayo QR = 0**; queda Unioccidente con 6 días ($979.638).

**CRUCE CON ADDI** (`Downloads/Resumen general.xlsx` = reporte Addi 1-abr→7-sep, hoja "Transacciones +
cancelaciones", aliado naturallight-online, tiendas "PLAZET PLAZA DE LAS AMERICAS"/"PLAZET UNIOCCIDENTE"/
"PLAZET UNICENTRO NORTE"/"LOCAL JARDIN PLAZA"; Addi paga ~45 días después; `scripts/addi-cruce.ts [--aplicar]`):
A) 27 ventas POS marcadas Addi → 24 exactas en Addi ✓; las 3 que no están (B1 6-may $35.650 y $74.600, B2
7-may $102.300, bodega "Rappi / Addi") SÍ están en Rappi → correctas. B) 7 QR de Unioccidente eran Addi →
reclasificadas (#19–#25: 12-may $140.000, 13-may $160.438 y $193.500, 20-may $78.550, 22-may $51.400,
24-may $286.250, 25-may $69.500). **MAYO QR = 0 en las 4 tiendas; junio 0; julio solo B2 5-jul $107.700;
agosto B1 17-ago $224.600, B2 14-ago $161.700, B3 31-ago $54.750.** 4 transacciones Addi de Jardín Plaza
(24-abr, 7/8/10-may) sin venta en el POS = JP aún era de NL.

**BUG del motor corregido (applyAdjustments)**: al aceptar a mano un día de DATÁFONO o QR, el motor
recalculaba `salesAmount` con el mapa de ventas en EFECTIVO → B2 8-may datáfono salía venta 387.000 y dif
1.329.600 (real: 1.717.300 vs 1.716.600 = −700); los totales "MANUAL" de datáfono/QR en /resumen y en el
cierre de mes estaban inflados (jul datáfono $6,58M → real −$3.870; QR $3,58M → $476.900). Ahora solo el
EFECTIVO se recalcula por días; datáfono/QR conservan montos y solo quedan MANUAL con la nota. Además el
modal del datáfono mostraba la dif con el signo invertido ("sobran 700" por "faltan 700") → corregido.
Caso B2 8-may: fac B2193 $23.800 no está en el datáfono y hay una transacción de $23.100 VISA débito sin
factura → se cobró 23.100 por una venta de 23.800: faltan $700 (aceptado el 27-ago como "diferencia menor").

**DATÁFONO = CRUCE EXACTO SIN NETEAR (regla de Paola, noche del 07-sep)** — "no me cruces valores tan
distintos; si entró al datáfono y no está en el sistema SOBRA, si está registrado y no está en el datáfono
FALTA". `src/lib/datafono-cruce.ts` (`cruzarDatafono`) es el ÚNICO cruce, usado por el motor
(`conciliarDatafono`), el tablero (`tar.falta`/`tar.sobra` por día y `tarFaltaTotal`/`tarSobraTotal`) y el
modal (`/api/datafono-dia`): pases autorización → tarjeta+autorización prefijo → valor+tarjeta → valor
(≤ `IGUAL`=50 pesos de redondeo: Conciliar trae 874.198 por 874.200) → **suma** (una factura con DOS
tarjetas / dos facturas en UN cobro) → **aprox** (≤500, solo para explicar; cuenta falta+sobra). Lo del
POS sin transacción = falta; lo del datáfono sin factura = sobra; pares con valor distinto = ambos lados;
devoluciones (negativos) se cruzan entre sí (devolución POS sin reversión = sobra; reversión sin POS =
falta). CUADRA solo si falta=sobra=0 (ya no hay tolerancia ±500 en el datáfono). `ConciliationResult`
tiene `falta`/`sobra`; `/resumen` los suma sin netear. `difference` sigue siendo el neto (referencia).
Efecto: B3 28-jun "falta $53.400 · sobra $8.500" (antes neto −44.900); B3 2-sep falta $65.400 · sobra
$65.900. Datáfono con DIFERENCIA: may 5 · jun 8 · jul 3 · ago 6 (`scripts/datafono-exacto-check.ts`).
La tabla de tiendas muestra "falta X" y "sobra Y" en dos líneas cuando hay ambos.

**Tablero por RANGO de fechas** (pedido de Paola): `/api/dashboard?from=YYYY-MM-DD&to=YYYY-MM-DD` (manda
sobre `month`; `inMonth` = dentro del rango; devuelve `rango`). En /tiendas: dos inputs de fecha + "Ver
período" junto al selector de mes (que se desactiva) + "✕ volver al mes"; las tarjetas suman las
diferencias de todos los días del período.

**QR: un solo pago cubre varias facturas** (PASE 3b del cruce QR + en `/api/qr-dia`): Nini Johana
$224.600 = facturas 5619 $224.000 + 5632 $600 en Plaza el 17-ago → Plaza agosto QR = 0. Quedan: B2 5-jul
$107.700, B2 14-ago $161.700, B3 31-ago $54.750.

**Jardín Plaza 31-jul / 4-ago (Paola)**: el 31-jul SÍ tiene efectivo ($391.550) pero se consignó junto con
1 y 2-ago el 3-ago → en la vista de julio la fila decía "agrupado ↓" apuntando a otro mes; ahora dice
"agrupado con 01/08 + 02/08 · consignado 03/08" y la dif "ver 02/08". El 4-ago Paola cuenta $105.050 y la
app tenía $17.500: la factura 3748 en efectivo ($87.550) se ANULÓ y se rehízo como 3774 con "Bono Regalo"
$87.550 + $250 efectivo, pero la plata sí se consignó ($105.050 el 5-ago, ref **31483657 → asignada a JP**,
antes sin tienda). Override #26: 3774 Bono → **Efectivo** (`PLATAFORMAS` ahora incluye "Efectivo" y "QR
Bancolombia" = métodos reales; `destino()` en overrides.ts). JP 3/4/5-ago CUADRA.

**Notas crédito de ALEGRA** (`Downloads/Alegra - devoluciones desde 01_04_2026 - hasta 08_07_2026.csv`,
UTF-8, primera línea `sep=;`, una fila por ÍTEM; "TOTAL - NOTA" viene SIN IVA → total real = suma de
"ÍTEM - TOTAL"; `scripts/cargar-nc-alegra.ts` → `CreditNote` con ncId `alegra-N`): 41 NC abr–jul. **40 son
"Anulación del documento" = factura anulada cuyo pago YA no aparece como ingreso en el reporte de
transacciones** (verificado: ninguna de esas facturas está en Sale) → no hay nada que restar. Solo NC19
(13-jun, B2, devolución PARCIAL $32.450 de la factura B21018 $72.200 efectivo del 14-jun) afecta plata:
no se aplicó (el faltante del grupo 13–15 jun $104.700 calza con un QR de Deyson Herrera $104.880) →
nota 📝 en B2 14-jun. El reporte de transacciones NO trae devoluciones (los "no Ingreso" son egresos a
proveedores/nómina). **B2 29-may** (Paola: "716.000 vs 684.274"): no es NC. Ventas efectivo 29-may
$716.975 (25 fac) vs depósito $684.275 del 1-jun (−32.700), pero el 30+31 ($1.583.201) recibió $1.687.849
(+104.648); el grupo 29–31 cierra con SOBRA $71.948. Pista: la factura **B2182 es del 8-may** y su pago
en efectivo (#677, $15.300) quedó fechado 29-may (pago tardío o re-fechado); 15.300 + 17.400 (B2941 o
B2979) = 32.700 exactos.

**Motor efectivo — "día robado"** (Paola: B3 19-may $247.600 consignado el 21-may): en el pase de
respaldo, si una consignación POSTERIOR calza exacto con UN solo día del grupo que este depósito
agruparía, ese día es de ella y se saca del grupo — solo si el grupo queda MEJOR sin él (|dif| menor),
para no robar por coincidencia (`recordSingle` + bloque "Día robado" en `conciliarEfectivo`). Un primer
intento en el pase exacto (saltar días) rompía 13–24 resultados en B1/B2 (huecos no contiguos calzaban
por azar) → descartado. Verificado con `scripts/dump-efectivo.ts` antes/después: solo cambian B3 20-may
(18 solo, falta $10.899, alerta QR Laura Acuña $11.000) y 21-may (19 CUADRA).
**Datáfono, regla adicional de Paola**: pareja del MISMO día con diferencia mínima (≤ `APROX` = 1.000)
cuenta solo la diferencia NETA (B2 8-may: falta $700, no 23.800/23.100); transacciones distintas siguen
completas a cada lado (B3 28-jun: falta 53.400 · sobra 8.500).

**RECLASIFICACIÓN MANUAL — `SaleOverride`** (`src/lib/overrides.ts`): "esta factura no fue QR, fue
Rappi/Addi/…" → se aplica sobre la fila Sale (method OTRO, bodega "<bodega> · <plataforma>") y se
REAPLICA tras cada recarga de ventas (`aplicarOverrides()` al final de la ingesta en ledger.ts), así
sobrevive. API `/api/venta-plataforma` (GET ?month · POST {date, store, invoice, amount, plataforma,
nota?} · DELETE {id} = deshacer, restaura método/bodega originales). UI: en el detalle QR del día, cada
factura sin pago tiene botones "fue Rappi" / "fue Addi" (EDITOR+) y abajo la lista de reclasificadas
con "deshacer".

**Notas de revisión:** ya eran compartidas (todos los usuarios ven las del mes); ahora cada nota muestra
su autor (nombre de la sesión SSO) y acepta **fotos de comprobantes**: tabla `NoteAttachment`
(bytes en la misma BD Neon; el navegador comprime a ≤1600px JPEG en `src/lib/imagen-cliente.ts`),
`POST/DELETE /api/notas/adjunto`, `GET /api/notas/adjunto/[id]` (sesión vía proxy). En /tiendas: el modal
de nota tiene "📎 Pegar foto", y en la lista del mes cada nota tiene "📎 foto", miniaturas clicables
(lightbox) y ✕ para borrar. Crear notas/adjuntar exige rol EDITOR+ en Conciliaciones → verificar que
Jerónimo tenga EDITOR (campo `rolConciliador` del usuario en la nómina, /usuarios del portal).

Cortes de datos ese día: ventas 7-sep (parcial) · QR banco 6-sep · MP 7-sep · datáfono 3-sep · Alianza 7-sep ·
Alegra 7-sep · Shopify 6-sep. Notas en BD: 0. Asignaciones manuales QR: 0 (Paola aún no resuelve el 35.650).

**Jerónimo (rol VIEWER) puede crear notas, pegarles fotos y editar el texto de las SUYAS, nada más**
(Paola): el proxy deja pasar `POST /api/notas*` y `PATCH /api/notas` al rol de solo lectura; la ruta
solo le permite `action: "edit"` sobre notas cuyo `autor` = su nombre/email. Resolver/reabrir/borrar
notas e imágenes sigue EDITOR+ y la página oculta esos botones al VIEWER (`/api/me` da name/email/rol).
Editar = "✎ editar" junto al texto (componente `TextoNota`), en el modal del día y en la lista del mes.
Una nota RESUELTA no se puede editar (ni por el autor ni por EDITOR+): hay que reabrirla primero.
Al editar también se pueden agregar archivos. Adjuntos = fotos (comprimidas en el navegador) **o PDF**
(tal cual, ≤3 MB; `application/pdf`); el PDF se muestra como ficha 📄 y abre en otra pestaña
(`AdjuntoChip` / `PendienteChip`).

**NUEVO formato de ventas Karrot — `karrot_pagos`** (`src/lib/parsers/karrot-pagos.ts`): el allsales
nuevo trae UNA FILA POR PAGO ("Nombre/Valor Método de Pago", "Cancelado", "TipoCuenta" CR/DB,
"Franquicia"). Emite una venta por (factura, método) → las facturas con **pago mixto** (75 entre jul y
sep; ej. 7949 del 2-sep en Unioccidente = $50.000 efectivo + $100.000 QR) ya no caen enteras en el
método principal; descarta anuladas (27) y separa crédito/débito. Detección: "# Factura" + "Valor
Método de Pago". Cargado el 07-sep (`scripts/cargar-archivo.ts`, 8.702 ventas 8-jul→7-sep): agosto pasó
de 37 diferencias a 15 (datáfono 11→4, efectivo 18→6, QR 8→5); sep 5→3; julio igual (5). Este es el
reporte que Paola debe bajar de Karrot de ahora en adelante (los formatos viejos siguen soportados).

**DETALLE DATÁFONO transacción por transacción** (pedido de Paola): `Sale` guarda ahora `hora`,
`franquicia`, `autorizacion`, `ultimos4` (solo los llena `karrot_pagos`; cada pago con tarjeta queda
como su propia venta) y `DataphoneEntry` guarda `autorizacion` + `ultimos4` (Conciliar: CODIGO
AUTORIZACION y TARJETA enmascarada). `GET /api/datafono-dia?date&store` cruza en pases: (1) misma
autorización, (1b) misma tarjeta + autorización prefijo (en el POS se digita incompleta: 98898 vs 988984),
(2) valor + últimos 4, (3) solo valor; devuelve cada pago del POS con su transacción (o "no está en el
datáfono", o "aut. X por otro valor") y las transacciones del datáfono sin POS. En /tiendas la VENTA de
datáfono del día es clicable → `DatafonoDetalleModal`. `scripts/datafono-revisar.ts [mes]` lo corre
sobre todos los días con DIFERENCIA. Recargados datáfono jul/ago/sep (Conciliar 0701_0731, 0801_0831,
0901_0907) + Karrot para llenar los códigos. Hallazgos: B3 8-ago fac 4371 $97.700 aut 515133 no está en
el datáfono; B3 11-ago sobra VISA CR $99.000 aut 069254 sin POS; B2 5-ago sobra $18.400; JP 20-ago sobran
$96.700 + $100.300 (misma tarjeta ····3911); B3 2-sep fac 7959 $9.400 vs datáfono $9.900 (····8643) y
fac 7970 $56.000 sin autorización que no está en el datáfono.

**Notas crédito NO vienen en el allsales** (Paola preguntó por una NC de $112.200 en B3 el 2-sep): el
informe no trae filas negativas ni devoluciones. **Caso resuelto con el conector Karrot (MCP
`generate-report`)**: `CUSTOMER_CREDIT_NOTES` / `ORDER_CREDIT_NOTE_VARIANTS` → NC 49 del 2-sep 19:07,
B3, 2 capuccinos con ganoderma, bruto $112.200 con dcto $56.100 (neto $56.100), venta 7963 (cliente
Jerónimo Duque). La 7963 (19:00) se pagó $56.000 VISA DB aut 289363 (SÍ está en el datáfono) + $56.200
efectivo. `CASHIER_BALANCE` (cierre de caja B3): la devolución quedó registrada como −$56.000 datáfono
y −$100 efectivo, y un minuto después la venta 7970 (19:08, anónimo) se cerró con $56.000 "datáfono"
sin autorización + $100 efectivo = un CAMBIO de producto. Lo que pasó con la plata: el datáfono nunca
devolvió nada (los $56.000 reales cubren la 7970) → la dif de datáfono de ese día es ficticia; y de la
caja salieron $56.200 en efectivo (la asesora contó $804.500 vs $860.500 del sistema) → la falta de
efectivo de $56.200 es REAL y coincide con el depósito. Regla aprendida: una NC registrada con el método
equivocado mueve la diferencia de un canal a otro.
**DEVOLUCIONES POR MÉTODO — CONSTRUIDO (misma noche)**: tablas `CreditNote` (CUSTOMER_CREDIT_NOTES)
y `CashierClose` (CASHIER_BALANCE, solo filas "Cash drawer close"), parsers en
`src/lib/parsers/karrot-mcp.ts` (formato CSV del conector, encabezados en inglés) y
`scripts/cargar-karrot-mcp.ts <csv...>`: guarda NC y cierres, y crea ventas NEGATIVAS sintéticas
(`Sale.source = "karrot_devolucion"`, invoice `DEV-<batch>`) por cada `Returns` ≠ 0 del cierre, en el
método del cierre (Efectivo→EFECTIVO, Datafono→TARJETA_DEBITO, Transferencia→TRANSFERENCIA). Así el
motor, el tablero y el resumen descuentan la devolución del canal correcto sin tocar el engine. Las
recargas de allsales NO borran esas filas (`deleteRange` excluye la fuente); `/api/qr-dia` y
`/api/datafono-dia` las excluyen del listado (el datáfono las muestra como "ya descontada la devolución").
El script también imprime el faltante contado por la asesora (System vs Counted del efectivo).
FLUJO: Claude saca por el conector `CUSTOMER_CREDIT_NOTES` (chiquito) y, para los días con NC,
`CASHIER_BALANCE` (≈10 KB/día todas las tiendas), guarda los CSV en `data-karrot/` y corre el script.
Validado 2-sep: JP pasa a CUADRA (devolvió $98.910 en efectivo), B3 datáfono queda CUADRA (+500) y
efectivo −$56.100 (la real); septiembre: datáfono 0 diferencias, efectivo 1. Cargados: NC 48–51 (sep) y
cierre del 2-sep. PENDIENTE: backfill jul–ago (NC + cierres de esos días) y el cierre del 7-sep (NC 50/51).
**API de Karrot**: Paola pasó una API key y la URL "de Claude" `https://d1vbt077gd3535.cloudfront.net`
(= el servidor MCP del conector). Quedaron en `.env` local como `KARROT_MCP_URL` / `KARROT_API_KEY`
(NO en Vercel ni en el repo). `scripts/karrot-mcp-probe.ts` y `-probe2.ts` prueban el saludo MCP
(initialize) en `/`, `/mcp`, `/sse`, `/messages` con Bearer, x-api-key, Token, Basic, api-key, query
`?apiKey=`… → SIEMPRE `401 {"status":"ERROR","message":"Unauthorized"}`. Lo más probable: el MCP usa
OAuth (como el conector de claude.ai) y esa key es de otra cosa, o va en un header que no adivinamos.
Falta la documentación/pantalla de Karrot de donde salió la key. Con eso la app podría bajar sola
ventas por método, NC y cierres, y Paola dejaría de subir el allsales.
`FINANCIAL_TRANSACTIONS` vino vacío para ese día. Horas: el allsales trae
hora Colombia; los timestamps del MCP vienen con "Z" pero también son hora local (apertura de caja
08:01Z, cierre 20:59Z) — no convertir.

**BUG corregido en la ingesta** (venía del "cargador acepta ZIP" de la noche anterior, a15f670): un
.xlsx también empieza por "PK" y `expandZips` lo descomponía en sus XML internos → cualquier Excel
subido desde ese deploy se ignoraba en silencio ("tipo de archivo no reconocido"). Ahora solo se
descomprime lo que tenga extensión .zip o firma PK sin ser Office (`[Content_Types].xml`/`xl/`).

Lo demás del 07-sep (Alegra por API, MP por API, asignación manual QR, detalle QR por día, ZIP en el
cargador, Amex en datáfono, Karrot MCP) está en la memoria de Claude `conciliador-plazet.md`.

## 04-sep-2026 — NUEVO canal "Ventas web": Shopify (Plazet + NL) vs Mercado Pago
- Página **/web** (sidebar "Ventas web", VIEWER+): pedidos de las tiendas online de Plazet y Natural Light
  cruzados contra los cobros de la cuenta de Mercado Pago (una sola cuenta para las dos, la ya cargada por archivo).
- Sync por API con botón "Sincronizar Shopify" (EDITOR+): `POST /api/shopify/sync` reemplaza los pedidos por tienda.
  `src/lib/shopify.ts` usa **client credentials grant** (token 24h con client_id+secret; sin OAuth). Apps "Conciliador"
  creadas en el Dev Dashboard de CADA organización (son orgs distintas): Plazet org 31767275, NL org 27585149;
  scopes read_orders+read_all_orders. Credenciales en env: SHOPIFY_{PLAZET,NL}_{SHOP,CLIENT_ID,CLIENT_SECRET}
  (Vercel Production + .env local). Fechas Shopify vienen en UTC → se convierten a Colombia (UTC-5).
- Cruce (`GET /api/web`): por monto (±$100) + fecha (≤4 días), global sobre el histórico, vista filtrada por mes.
  Muestra comisión y neto MP por pedido, reembolsos aparte, y alerta "sin cobro MP".
- Modelo nuevo `ShopifyOrder` (db push aplicado 04-sep). Volumen real desde abr-2026: Plazet 54 pedidos $4,8M ·
  NL 767 pedidos $86,3M. Prueba de conexión: `scripts/test-shopify.ts` (solo lectura).
- Pendiente/futuro: traer Mercado Pago también por API (hoy sigue por archivo de liquidaciones).

## 27-ago-2026 (tarde) — script APLICADO en BD + "consignación en domingo" (falsa alarma)
- Paola corrió `npx tsx scripts/limpieza-27ago.ts` (desde el chat con el prefijo `!`, que ejecuta en su PC
  y sí puede escribir en Neon). Resultado: Mariana reasignada (BankEntry 6616 06-ago $402.850 y 6608
  10-ago $1.887.650 → ref 3102874360 B1), 12 Alegra B2 < 5-may borradas, Linux recargado, QR 14–25 ago
  y MP 25–27 ago insertados, 132 aceptados con nota. Estado final: abr 0 dif / 0 sin conciliar (listo
  para cerrar en /meses), may 23+2, jun 10, jul 5, ago 23+5. Quedan 68 pendientes reales (lista en la
  salida del script; mayores: datáfono B3 23-may $630.000, Principal 1-may $766.600, 15 días QR de mayo).
- Paola reportó "consignación en domingo" en Plaza (9-ago con falta $2.286.625). NO era corrimiento de
  fechas: (a) la tabla de /tiendas pone el depósito en la fila del ÚLTIMO día de venta que cubre y (b) la
  falta era el caso Mariana perdido (extracto recargado tras el 14-ago → ids nuevos). Verificado: 0 recaudos
  en sáb/dom en todo el extracto; fechas son strings YYYY-MM-DD sin zona horaria (`scripts/diag-domingo-b1.ts`).
  Mejora UI: la celda Depósito ahora muestra "consignado lun 24/08" debajo del monto.
- Todo commiteado y pusheado (deploy Vercel) — `REF_FIXES` en `banco.ts` hace que Mariana sobreviva recargas.

## 27-ago-2026 — REVISIÓN EXHAUSTIVA contra "movimientos bancos.xlsx" (aplicada esa tarde, ver arriba)
Paola pidió cruzar TODO (efectivo, datáfono, QR, Mercado Pago, Rappi/Addi) contra el
consolidado `Escritorio/HABBIE/PLAZET/MOVIMIENTOS BANCOS/movimientos bancos.xlsx` y
verificar la pestaña «Abril día a día» del Estado de cuenta con Natural Light (Google
Sheet 1F0prfniVTcQHxExNkYwAaxSW83V8V8jFJ6GTM2R_FB0). Reporte completo en el artifact
"Revisión Bancos–Conciliador" (chat 27-ago).
- **Alianza**: BD = consolidado al 100% (575 mov, 394 recaudos $304.685.088).
- **Bancolombia**: abonos netos del datáfono = reporte Conciliar día a día (79/79).
  QR estaba al 14-ago: faltaban 1 pago del 14 + 53 del 15–25 ago ($4.948.825). Además el
  parser ignoraba TRANSFERENCIAS de clientes que el POS registra como QR Bancolombia
  (99.800 20-ago, 790.500 corresponsal 19-ago, 820.353 Pavlove 15-jul = fac 989…) →
  `datafono-banco.ts` ahora las lee (≥ $20.000, nunca CREDICORP).
- **Mercado Pago**: faltaban 11 operaciones del 25–26 ago (+1 del 27-jul devuelta el mismo día, no se carga).
- **Rappi**: la cuenta "Rappi" del consolidado es RappiPay (solo traslados NL/Paola/Jero); no hay
  liquidaciones de ventas Rappi en ninguna cuenta. **Addi**: único candidato en banco 6-ago
  "PAGO DE PROV CREDICORP CAPITAL" $3.394.441 — Paola debe confirmar.
- **Código cambiado (sin commit)**: `linux.ts` cortes reales (tarjeta desde 23-abr B3 / 24-abr
  B1-B2 = cuando arrancó el Credibanco de Habbie; Unioccidente en Linux hasta 4-may);
  `ledger.ts` descarta Alegra B2 < 5-may (12 facturas duplicadas del 1-may); `banco.ts`
  REF_FIXES (caso Mariana, sobrevive a recargas — el fix del 14-ago se había perdido OTRA VEZ);
  `datafono-banco.ts` transferencias de clientes.
- **Script `scripts/limpieza-27ago.ts`** (`--dry` = solo lectura, validado): aplica ref
  3209052268→B3, Mariana, borra dup Alegra B2, recarga Linux, QR 14–25 ago + transferencias,
  MP 25–26 ago, recalcula y acepta con nota 132 resultados por reglas (NL cerradas/abril,
  transición datáfono, efectivo→QR con contraparte, pares que se compensan ±$1.500,
  menores: efectivo ≤$5.000 / datáfono-QR ≤$1.500). Quedan 68 pendientes (5 son "fuera de
  rango" del 26-ago y 15 son QR de mayo). **NO SE PUDO EJECUTAR** desde Claude (bloqueo de
  escritura a la BD): Paola debe correr `npx tsx scripts/limpieza-27ago.ts` en el repo.
- **Hoja «Abril día a día»** (hallazgos, en el artifact): consistente y = Linux día a día ✓;
  efectivo→Habbie corroborado salvo: Unioccidente "sin consignar $80.000" SÍ entró (dep 4-may
  $900.300); Sabana 10-11 abr marcados →NL entraron a Habbie ($479.600) + $13.150; San Pedro
  +$122.000; Éxito Occidente NO calza día a día (un solo dep 20-abr $3.842.765 + $860.850 del
  15-abr con ref de Unioccidente = 12-14 abr) → banco tiene ≈$918.000 MÁS que la hoja.
  Datáfono→Habbie subestimado ≈$3.49M vs Credibanco de Habbie (transición 24-abr–4-may y JP).

## 16-ago-2026 — CIERRE DE MES (nueva página /meses)
Pedido de Paola: poder cerrar un mes cuando esté todo conciliado y que no
vuelva a moverse. Construido completo:
- **Página `/meses` "Cierre de mes"** (sidebar, candado, minRol EDITOR):
  lista los meses con estado (Cerrado / Listo para cerrar / N pendientes) y
  totales. Cerrar con confirmación en dos pasos; reabrir SOLO ADMIN.
- **Aceptar diferencias con nota**: si el mes tiene DIFERENCIA/SIN_CONCILIAR,
  el panel "Revisar pendientes" lista cada una con campo de nota obligatorio;
  aceptar = POST /api/adjust con las MISMAS salesDates + nota → queda MANUAL.
  Cuando todo es CUADRA/MANUAL el mes queda "limpio" y se puede cerrar.
- **Foto congelada**: al cerrar, /api/months guarda snapshotJson (los
  resultados del mes) + closedBy/closedAt en MonthStatus (columnas nuevas,
  db:push ya aplicado en Neon). computeLedger sirve los meses cerrados DESDE
  LA FOTO (aunque cambie el motor, el refMap o se recargue un archivo) y
  recuenta los totales. Reabrir borra la foto y vuelve al cálculo vivo.
- El candado de ingesta ya existía (ledger.ts omite filas de meses cerrados
  con aviso) — con la foto, el cierre queda blindado por los dos lados.
- Validado con `scripts/test-cierre.ts` (cierra junio directo en BD, verifica
  foto servida idéntica y totales, reabre y revierte). Build OK.
- Estado real al 16-ago: ningún mes está limpio aún (abr 13 dif + 47 sin
  conciliar, may 38+6, jun 38, jul 26, ago 11+4). Para cerrar toca aceptar
  esas diferencias con nota en /meses. OJO: para meses con MUCHOS pendientes
  (abril) puede convenir un "aceptar todos con una nota" — no construido aún,
  proponérselo a Paola si le da pereza uno por uno.

## 14-ago-2026 — caso Mariana resuelto (ref de celular) + commit del motor nuevo
- **Caso Mariana (Jineth Marian Salamanca)**: trabajaba en Unicentro Norte (B3) y
  consignaba con la ref `3138845101` (su celular). Se trasladó a Plaza (B1)
  ~05-ago y siguió consignando con su número → sobraba en B3 y faltaba en B1.
  Corregido en BD (campo `reference` de las filas puntuales, NUNCA el mapeo
  general `CashReference`): BankEntry **6352** (06-ago $402.850 = venta B1
  05-ago exacta) y **6344** (10-ago $1.887.650 = ventas B1 06+07-ago, dif −$50)
  reasignadas a `3102874360` (B1). Con eso agosto quedó CUADRA completo en B1 y
  B3, salvo B3 06-ago: consignaron $1.000 de más (real).
- **GOTCHA importante**: recargar el extracto del banco BORRA y recrea las filas
  BankEntry → los fixes manuales de referencia se pierden (ya pasó: el fix del
  id 5810 del 10-ago se perdió y hubo que rehacerlo como id 6352). Si se recarga
  el extracto de agosto, rehacer la reasignación de esas 2 consignaciones.
  Mariana se retiró el 8-ago-2026, así que no deberían aparecer casos nuevos;
  si el patrón se repite con otra persona, considerar mapeo de referencias con
  vigencia por fechas.
- Scripts nuevos: `mariana-cruce.ts` (diagnóstico consignaciones + motor B3/B1
  de un mes) y `mariana-fix.ts` (la reasignación puntual).
- En este commit va también todo lo del 09/10-ago que estaba sin commitear:
  motor EFECTIVO reescrito (bug de cascada), fix Addi/Rappi/Nequi del Linux,
  página /resumen (ver sección siguiente).
- Suelto: consignación 05-ago $105.050 ref `31483657` sigue sin tienda asignada
  (ref de las cerradas NL, pendiente de Paola).

## 09/10-ago-2026 — motor EFECTIVO reescrito + fix Addi/Rappi/Nequi + /resumen
- **`conciliarEfectivo` rediseñado en dos fases** (bug de cascada hallado por
  Paola en Unicentro mayo): (1) pase de calce EXACTO por consignación individual
  y luego suma del mismo día, en barridas repetidas hasta no progresar, con
  guard de distancia (`businessDaysBetween > maxGroupDays+4` → no intentar);
  (2) el resto una fecha a la vez (más antigua primero) con el algoritmo de
  respaldo, reintentando el pase exacto tras cada una. Validado contra TODO el
  histórico abr–jul (ningún mes empeoró; abril 23→13, mayo 43→38).
  Invariante en `scripts/test-unicentro.ts`.
- **`linux.ts`**: Addi/Rappi/Nequi/QR-Bold venían dentro de la columna TAR como
  si fueran datáfono (las 4 tiendas). Ahora se distinguen por NOMTAR
  (`claseTarjeta`/`plataformaLinux`). Histórico recargado.
- **Nueva página `/resumen`** (+ `/api/resumen`): totalizado de todo el
  histórico por método de pago, por mes y por tienda; excluye los
  SIN_CONCILIAR de borde (fuera de rango) para no inflar la "falta".

## Cómo levantar la app
```
cd "C:\Users\Paola Agreda\OneDrive\Escritorio\PROYECTOS PAO\conciliador-plazet"
npm run dev        # http://localhost:3000
```
⚠ En estas sesiones el servidor de dev se cae solo cada rato; hay que relanzarlo.
Pendiente dejar un arranque estable (build + start, o servicio) al final.

## Lo que YA quedó hecho en la app (esta semana)
1. **Parser de Karrot** (`src/lib/parsers/karrot.ts`) — lee el allsales (hoja
   "Ventas detalle por artículo"), agrupa por factura, tienda por Código Almacén
   (B1/B2/B3, C1=JP; NL y Tienda Shopify = online, sin tienda física).
   - Detección en `detect.ts` (kind "karrot"): busca "# FACTURA" + "MÉTODO DE PAGO PRINCIPAL".
   - `ledger.ts`: desde el corte KARROT_CUTOVER=2026-07-08 la fuente de ventas es
     Karrot; las filas de Alegra ≥ esa fecha se descartan (para no duplicar).
   - ACABO DE AGREGAR (sin recargar aún): para pagos OTRO guarda la plataforma en
     bodega como "<tienda> · Mercadopago/Rappi/Addi/Pago Online/Bono". FALTA
     RECARGAR el allsales para que tome efecto (ver "en curso" abajo).
2. **Tablero "Tiendas"** (`src/app/tiendas/page.tsx` + `src/app/api/dashboard/route.ts`):
   nueva página en el menú lateral. Selector de MES + TIENDA + CANAL. Tarjetas por
   canal, gráfico de barras diario (venta vs recaudo, barras rojas si dif ≥ $1.000),
   tabla día a día con dif por canal (amarillo 500-999, rojo ≥1.000), alertas ¿QR?
   y tardía, panel QR empresa. Colores Plazet.
3. **Filtro por CANAL** (lo último que estaba haciendo): chips Todo/Efectivo/
   Datafono/QR/Mercadopago/Rappi/Addi. El API ya desglosa otros por plataforma
   (mpV/rappiV/addiV/otroV vía keyword en bodega). La página ya filtra tarjetas,
   columnas de tabla y gráfico según el canal elegido.

## 23-jul-2026 — carga desde carpeta + 2º formato de Karrot
- **`scripts/cargar-carpeta.ts`**: carga TODO lo que haya en `muestras-conciliacion`
  (detecta el tipo por contenido y descomprime los .zip del CSV 191). Reemplaza al
  frágil `demo-carga.ts`, que referenciaba nombres de archivo fijos.
  `npx tsx scripts/cargar-carpeta.ts [carpeta]`
- **`src/lib/parsers/karrot-ventas.ts`** (kind `karrot_ventas`): parser del
  `reporte_ventas_*.xlsx` de Karrot (hoja "Ventas"). Es el formato PREFERIDO:
  columnas "Pago <método>" dinámicas → separa bien los pagos MIXTOS, excluye las
  ventas anuladas y trae Rappi/Addi/Mercadopago como columna propia. Tienda por
  "Ubicación" (plaza de las americas=B1, unicentro de occidente=B2, unicentro
  norte=B3, jardín plaza=JP; "nl" y "tienda shopify" = web, sin tienda).
  Repara el mojibake de los encabezados (a veces exporta "UbicaciÃ³n").
- **Corte anti-duplicado en los dos sentidos**: Alegra aporta solo `< 2026-07-08`
  y Karrot solo `>= 2026-07-08`. Verificado: Karrot arranca justo el 8-jul.

## 24-jul-2026 — Mercado Pago, tablero falta/sobra, QR por tienda, Linux abril/mayo
- **Lector de Mercado Pago** (`src/lib/parsers/mercadopago.ts`, kind `mercadopago`,
  tabla `MercadopagoEntry`): lee el settlement (liquidaciones) XLSX. Es el recaudo
  del canal Mercadopago (de HABBIE). Panel de empresa en el tablero (venta POS vs
  cobrado bruto/neto + comisiones). El cobro entra 1-4 días antes de facturarse.
- **Convención falta/sobra en TODO el tablero**: faltante = venta − recaudo.
  FALTA (venta > recaudo) = ROJO; SOBRA (recaudo > venta) = AMARILLO; |dif|<$500 =
  cuadra (verde). Ya no es por tamaño sino por signo (helpers difColor/difTexto en
  tiendas/page.tsx). Celdas muestran "falta $X" / "sobra $X".
- **Columna Estado consciente del canal**: el triángulo solo se prende por los
  canales visibles (antes el efectivo prendía alarma aunque miraras datáfono).
- **QR por tienda (heurística)**: el banco no separa QR por tienda, así que se
  asigna cada pago QR del banco a la tienda cuya venta QR (Karrot) tiene el MISMO
  valor exacto (fecha ±6 días). En julio asignó $10.128.850 de $10.599.050 (95%).
  Jardín Plaza QR cuadra exacto. Ver `qrResumen`/`qrBancoTienda` en dashboard/route.
- **Lector de Linux** (`src/lib/parsers/linux.ts`, kind `linux`, source `linux`):
  carga las ventas del sistema anterior (ventaSabmyju.xlsx en "sistemas anteriores")
  SOLO de las 4 tiendas que siguen: BD→B1, Q9→B2, BQ→B3, D0→JP. EFECTIVO de
  B1/B2/B3 desde 1-abr (mes completo, pedido de Paola); TARJETA solo desde el corte
  16-abr (antes el datáfono era de NL); JP todo desde 16-may. Se ingesta con
  source="linux" (no pisa Alegra/Karrot). Abril pasó de 85 sin conciliar a
  26 cuadran/30 dif/55 sin conciliar. El efectivo pre-16-abr sale como "falta"
  (fue a NL, no al banco de Paola) — es lo esperado.
- **`scripts/cargar-carpeta.ts`** ahora también toma el ventaSabmyju.xlsx del
  subfolder. Diagnósticos nuevos: `estado-mes.ts`, `efectivo-tienda.ts`,
  `dia-tienda.ts`, `mp-cruce.ts`.

## QR día por día + ambigüedad (24-jul, tarde)
- El cruce de QR por valor ahora es por (tienda, DÍA): el filtro QR del tablero
  muestra QR venta / QR banco / Dif QR por día, con falta rojo / sobra amarillo.
- **Regla de ambigüedad por CONTEO (Paola)**: si un valor está en 2+ tiendas pero
  al banco entran TANTOS pagos idénticos como ventas → cada tienda tiene el suyo,
  se asignan (uno a cada una). Solo si entran MENOS pagos que ventas es ambiguo.
  El banco no trae hora (solo fecha/valor/nombre del pagador).
- **PASE 2 casi-exacto (24-jul noche, validado por Paola)**: tras el cruce exacto,
  segundo pase con tolerancia ±$500 (ej. cliente pagó $35.600 por venta de
  $35.650 — caso real ANA BELEN VEJAR 15-jul → Plaza) y desempate de ambiguos por
  FECHA más cercana (luego menor dif de valor). Solo si dos tiendas empatan
  exactamente igual queda "por revisar". Resultado julio: POR REVISAR = 0,
  asignado $10.164.450, sin asignar $434.600. El residuo (ej. $50) queda visible
  como dif del día (verde si <$500).
- Diferencias QR que quedan en julio (para revisar 25-jul): B1 22-jul falta
  $646.200 (grande); B2 05-jul $107.700 (venta sin pago); B2 24-jul $241.900
  (banco llega al 23, seguro entra con el extracto siguiente); B3 03-jul $188.560
  (conocida).
- PENDIENTE: botón/UI para ASIGNAR manualmente esos pagos ambiguos a una tienda
  (Paola dijo "y la asignes"). Hoy solo se listan; falta poder fijarlos.
- Karrot julio ya quedó fresco hasta 24-jul (reporte_ventas_...24).

## OJO — Karrot de julio quedó de una carga anterior
Paola limpió la carpeta muestras-conciliacion y quitó los reporte_ventas/allsales
de Karrot. Por eso las ventas de julio en la BD (llegan al 24-jul) son de una carga
previa, no de un archivo actual. Para dejar julio fresco: volver a poner en la
carpeta el `reporte_ventas` de Karrot del 8-jul a hoy y recargar.

## 25-jul — REVISIÓN DE DIFERENCIAS (hallazgos, scripts qr-dia-detalle / datafono-dia)
RESUELTAS (no era plata perdida):
- Plaza EFECTIVO: el dep 21-jul cubrió 17-20 jul (dif −$101) y el del 23 cubrió
  21-22 (+$50) → el "+$419.699" era solo corte de datos. Quedan 4 movimientos
  chicos que se compensan (−3.400 / +44.600 / −43.550 / +21.900).
- B3 DATÁFONO 4-jul vs 7-jul: Plink 4-jul $231.000 (MC crédito) = fac 7913 del
  7-jul → cobraron el 4, facturaron el 7. Se cancelan.
RESUELTO 25-jul — PAGOS "LLAVE" (hallazgo de Paola): el extracto 191 trae pagos
"PAGO LLAVE" (Bre-B) que el parser ignoraba (solo leía "PAGO QR"). Corregido en
datafono-banco.ts (PAGO QR | PAGO LLAVE). Con eso se resolvieron:
- ✔ PLAZA 22-jul: fac 1940 $399.000 (LLAVE RUBEN LOP) y fac 1938 $247.200
  (LLAVE ALESSANDRI) — sí llegaron.
- ✔ B3 3-jul QR: fac 7672 $188.560 (LLAVE ANGELA MAR) — sí llegó.
- ✔ B2 24-jul $241.900 — cerró con el CSV fresco del 25.
El CSV trae además 38 pagos PSE (aún no se usan — ¿ingresos de qué?).
QUEDA PENDIENTE (preguntar a asesoras):
- ⚠ UNICENTRO NORTE 3-jul: fac 7667 $203.900 (tarjeta, no está en Plink de
  NINGUNA tienda).
- B3 2-jul: fac 7544 $97.200 vs Plink $92.700 → $4.500 digitados de menos.
PROBABLE CRUCE (confirmar con Paola):
- B2 5-jul QR $107.700 ↔ pago CARLOS JULIO $107.000 del 5-jul (cliente pagó $700
  menos; queda fuera de la tolerancia ±$500 — ¿subir a $1.000 o asignar a mano?).
  ES LA ÚNICA dif QR de julio que queda a nivel tienda-día.
PAGOS QR del banco SIN venta (sobró plata): 2× $132.000 SANDRA MILENA 1-jul,
$63.600 NUBIA 4-jul. QR empresa julio: banco recibió $406.150 MÁS que las ventas.

## 27-jul — MERCADO PAGO: evidencia de la diferencia (mp-cruce.ts)
89/107 cobros casan con ventas (±8 días por el desfase de facturación web).
- COBROS SIN VENTA $2.054.645: los graves son 3-jun $42.650, 21-jun $118.250,
  7-jul $119.950, 8-jul $95.450, 10-jul $77.866, 13-jul $172.003 y $125.400
  (¡este es el pedido web #NL11667 sin facturar!), 15-jul $84.558+$81.168,
  17-jul $79.300, 18-jul $87.600. Los 7 del 19 y 21-jul ($970.450) seguramente
  se facturaron después del 24 → se cierran con settlement fresco (el cargado
  llega al 21-jul) + Karrot fresco.
- VENTAS "Mercadopago" SIN COBRO $805.400: fac 8076 $126.600, 8071 $132.400
  (6-jul), 8309 $189.750, 8308 $62.600 (7-jul), web 281 $115.250 (10-jul),
  860 $56.900 (14-jul), 1736 $121.900 (21-jul). Despachadas sin plata en MP.
- PREGUNTA ABIERTA a Paola: ¿generar Excel bonito con estas dos listas?
- PEDIRLE: settlement de MP del 22-jul a hoy.

## 28-jul — TABLA FINAL DEL CRUCE NL (formato aprobado por Paola paso a paso)
Scripts: nl-abril-paso.ts (4 tiendas, D0 sin las devoluciones negativas de
abril — pedido Paola), nl-cerradas-paso.ts (5 cerradas), nl-deuda-actualizada.ts.
Estructura de la tabla (columnas: Facturado | →NATURAL | →HABBIE | No consignado):
- 4 tiendas (1-abr→arranque Alegra c/u; JP solo 16→27 may): facturado
  $159.332.943 | NL $76.883.430 | HB $82.449.513 (incluye el efectivo "sin
  cuenta" ya verificado contra banco) | no consignado 0.
  Por tienda (fact/NL/HB): Plaza 56.625.546/28.631.508/27.994.038 ·
  Unioccidente 49.631.417/26.318.827/23.312.590 · UNorte 41.921.030/21.442.195/
  20.478.835 · JP 11.154.950/490.900/10.664.050.
- 5 cerradas (HB = cifras verificadas banco, las del cruce): fact $71.505.260 |
  NL $55.907.780 | HB $15.154.680 | NO CONSIGNADO $442.800 (BB 28.500 + BC
  73.150 + BF 64.450 + BM 276.700 — problema de NL, no afecta deuda).
  Por tienda (fact/NL/HB/noconsig): ÉxitoOcc 19.409.140/15.537.875/3.842.765/
  28.500 · Viva 12.120.795/11.037.580/1.010.065/73.150 · Sabana 10.911.200/
  8.050.150/2.796.600/64.450 · SanPedro 10.098.035/6.853.885/3.244.150/0 ·
  UCali 18.966.090/14.428.290/4.261.100/276.700.
- Fila Rappi may-jun (recaudó NL): $1.687.150 → NATURAL.
- Fila transferencias NL→Habbie: $32.976.384 → HABBIE (16-abr 22M + 24-abr
  10.976.384).
- TOTAL: NATURAL $134.478.360 | HABBIE $130.580.577 | no consignado $442.800.
- Cierre: de NL es tuyo $29.127.071 (tarjetas 27.439.921 + Rappi 1.687.150);
  tuyo es de NL $63.010.636 (efectivo precorte 14.879.572 + cerradas 15.154.680
  + transferencias 32.976.384) → HABBIE DEBE $33.883.565.
- Verificado: en julio NO hay Rappi/Addi nuevos (nada de Paola pasa ya por NL).
PENDIENTE de Paola: (1) confirmar fac 6216 22-jun $118.250 marcada Rappi pero
= cobro Mercado Pago 21-jun (op 164414384091) → deuda pasaría a $34.001.815;
(2) decir si ha abonado algo a NL desde ~16-jul; (3) visto bueno para regenerar
el "Cruce Habbie - Natural Light.xlsx" formal con estas hojas nuevas.

## 31-jul — ✅ SSO EN PRODUCCIÓN FUNCIONANDO DE PUNTA A PUNTA
Probado con sesión fabricada (next-auth/jwt encode + secreto compartido):
nómina firma pase → conciliador canjea → /tiendas 200. LISTO.
La causa raíz de los 2 días de lucha: el formulario "sensitive" de Vercel
corrompía el valor tipeado. Solución: borrar la variable y recrearla con
Sensitive APAGADO para verificar el valor a ojo antes de guardar. Así se hizo
en conciliador (SSO_SECRET, por mí) y en nómina (NEXTAUTH_SECRET, por Paola).
El secreto compartido (43 chars) está en scratchpad/sec.txt y en ambos .env.
Falta confirmación visual de Paola del flujo completo en su navegador.
Pendientes menores: rotar los secretos a "Sensitive" de nuevo si se quiere
(opcional), login con Google (crear OAuth en Google Cloud), usuario de Jero
solo-Conciliaciones, y que Paola cambie su clave (temporal: Plazet-5fnwr2).

## 29-jul — PUBLICADO EN VERCEL; falta UN paso (SSO_SECRET bien grabado)
ESTADO: portal en producción https://plazet.vercel.app (marca "Plazet", login
aterriza en /portal, enlace Portal en sidebar) ✔ · conciliador en producción
https://conciliador-plazet.vercel.app (protegido, apunta al portal) ✔ ·
NEXTAUTH_URL=plazet.vercel.app ✔ · CONCILIADOR_URL en nómina ✔ ·
deploys desbloqueados (git author era gmail; ahora paola@plazet.co) ✔.
PROBLEMA PENDIENTE: el botón Conciliaciones da "pase venció o no es válido".
Causa: el SSO_SECRET grabado en Vercel (conciliador) NO coincide con el
NEXTAUTH_SECRET. Ya generé secreto nuevo (43 chars, en scratchpad sec.txt y en
ambos .env locales, verificados iguales) y lo escribí en Vercel en ambos
proyectos + redeploys — pero el canje SIGUE fallando: el valor tipeado en el
conciliador quedó mal (campo sensitive, no verificable a ojo). Al intentar
reescribirlo la ventana de Chrome quedó minimizada (viewport 0x0).
SIGUIENTE PASO EXACTO: con Chrome visible → conciliador-plazet → Env Vars →
SSO_SECRET → Edit (o Delete y recrear SIN "Sensitive" para verlo) → pegar el
valor de sec.txt → Save → Redeploy → probar canje con scripts (firmar JWT con
SSO_SECRET local aud=conciliador-plazet → /api/sso?token=... debe redirigir a
"/" y no a /acceso?error=pase). La clave temporal de Paola: Plazet-5fnwr2.
OJO: al cambiar NEXTAUTH_SECRET su sesión de producción se invalida (re-login).

## 27-jul noche — PORTAL LISTO EN LOCAL, PENDIENTE QUE PAOLA LO PRUEBE
TODO construido y probado por mí (falta el visto bueno de Paola):
- Conciliador migrado a POSTGRES EN NEON (base "conciliador", misma instancia
  de la nómina; datos migrados completos desde dev.db: 11.859 ventas, etc.).
  dev.db queda como respaldo local. Pool pg max 20 (el tablero dispara ~12
  consultas paralelas y con el default daba error de conexiones).
- LOGIN ÚNICO: nómina /portal con dos tarjetas (Nómina/Conciliaciones) según
  permisos; login aterriza en /portal; /api/sso-conciliador firma pase JWT
  5 min (NEXTAUTH_SECRET) → conciliador /api/sso lo canjea por cookie 30 días;
  proxy.ts exige sesión (páginas→/acceso, APIs→401). Usuario sin accesoNomina
  (Jero) rebota al portal. Casillas Nómina/Conciliaciones en Usuarios + columna
  Apps. ADMIN (paola@plazet.co) ya tiene Conciliaciones habilitado en la BD.
- Flujo SSO probado con pase firmado a mano: canje→cookie→tiendas 200 ✓.
- COMMITS LOCALES SIN PUSH: conciliador f49f87c (remoto ya existe:
  github.com/paola-Plazet/conciliador-plazet, commit inicial ab5dd94 pusheado);
  nómina 44b198c (¡AHEAD 1 — NO pushear hasta que Paola pruebe, el push
  DESPLIEGA a producción!).
CÓMO PROBAR EN LOCAL (2 servidores):
  nómina:      cd nomina-colombia && npm run dev          (puerto 3000)
  conciliador: cd conciliador-plazet && npx next dev -p 3001
  → entrar a localhost:3000, login Google, portal, botón Conciliaciones.
PARA PUBLICAR (cuando Paola apruebe):
  1. push nómina (auto-deploy Vercel) + push conciliador.
  2. Paola importa conciliador-plazet en Vercel. Envs del conciliador:
     DATABASE_URL (la de .env del conciliador), SSO_SECRET (= NEXTAUTH_SECRET
     de la nómina), NEXT_PUBLIC_NOMINA_URL (URL de la nómina en Vercel).
  3. En el proyecto nómina de Vercel agregar CONCILIADOR_URL (URL del
     conciliador en Vercel) y redeploy.
  4. Probar el flujo en producción y habilitarle a Jero su usuario.

## 27-jul — VERCEL: portal Nómina + Conciliaciones (EN CURSO)
Decisión: DOS proyectos Vercel separados + botones de portal (la nómina es
Next 14 y el conciliador Next 16 — no se fusionan). Pasos:
1. ✔ git init + commit inicial del conciliador (ab5dd94, 120 archivos;
   .gitignore excluye *.db, .env y src/generated). Sin remoto todavía.
   OJO: no hay gh CLI ni vercel CLI; la nómina publica por git HTTPS normal
   (credenciales de Windows) → el push al repo nuevo debería funcionar igual.
2. FALTA DE PAOLA:
   a. Crear repo vacío en GitHub (sugerido: paola-Plazet/conciliador-plazet,
      PRIVADO) — yo hago el push.
   b. Crear base de datos Postgres en Neon (nuevo proyecto "conciliador") y
      pasarme el DATABASE_URL — la de nómina es aparte, no se mezclan.
   c. Decidir clave de acceso para la app (irá como env var).
3. YO DESPUÉS: migrar schema.prisma de sqlite→postgresql (+ @prisma/adapter-pg
   como nómina), db.ts, prisma db push a Neon, recargar datos con
   cargar-carpeta apuntando a Neon, middleware de login simple con la clave,
   push, y Paola importa el repo en Vercel (framework Next, env DATABASE_URL +
   APP_PASSWORD). Al final: botones "Nómina"/"Conciliaciones" en la nómina
   (repo C:\Users\Paola Agreda\nomina-colombia) apuntando a las dos URLs.

## PENDIENTE 25-jul — pedidos de Paola (en orden)
1. **Volver a revisar y DISMINUIR las diferencias** que quedan (pedido explícito
   24-jul noche). Empezar por: B1 QR 22-jul $646.200; datáfono B3 3/4/7-jul
   (±$230k que casi se compensan); efectivo Plaza dep 21-jul +$419.699 (debería
   absorberse ya con Karrot al 24 — verificar); los "sin conciliar" de mayo (12) y
   los 30 dif de abril. Cargar extractos frescos (banco/QR al 24-25) ayuda solo.
2. **Unir este proyecto (Conciliador) con el de Nómina en Vercel**: pantalla de
   inicio con DOS botones "Nómina" y "Conciliaciones", que se sienta como un todo.
   (Nómina: repo paola-Plazet/nomina-plazet, Next 14. Conciliador: Next 16, no
   está en git todavía — decidir monorepo o landing que enlace a dos despliegues.)
3. Botón para asignar a mano un pago QR ambiguo a una tienda (si reaparecen).

## EN CURSO (lo que estaba corriendo cuando reinició)
- **Recargar el allsales de Karrot** para que el desglose Mercadopago/Rappi/Addi
  tome efecto. El script `scripts/demo-carga.ts` falló porque referencia archivos
  que ya no existen con ese nombre exacto (Plink 0701-0716 y el Alegra que quité).
  ARREGLAR demo-carga.ts (revisar nombres reales en muestras-conciliacion) o
  simplemente subir el allsales por la UI (/cargar) y listo.
- Verificar el tablero con el filtro de canal en el navegador (no alcancé a ver
  la captura final tras el cambio).

## PRÓXIMOS PASOS acordados con Paola
1. **Paola va a cargar archivos frescos** a `muestras-conciliacion`: extractos de
   banco (efectivo `movimientos_...xls` y CSV 191 del QR) y allsales de Karrot al
   día. Con eso el tablero llega hasta hoy. Cargarlos por /cargar o demo-carga.
2. Terminar/pulir el **filtro por canal** (verificar Rappi/Addi salen bien).
3. **Correo automático de diferencias** (pendiente histórico): consolidado a
   Jerónimo + individual a cada asesora, botón manual tras cargar. FALTA de Paola:
   contraseña de aplicación del Gmail de Habbie + correos (Jerónimo y asesoras).
4. Dejar la app con arranque estable.

## Cabos sueltos de conciliación (no urgentes)
- 3 pedidos web NL sin factura en Karrot (#NL11667 $125.400, #NL11684 $55.900,
  #NL11686 $32.100) y transferencia fact 989 $820.353 (¿mayorista?).
- Mercadopago jun-jul: confirmado es de HABBIE (no entra a NL).
- QR mayo: +$399.965 vendido sin entrar al banco (ver hoja QR Excel mayo).
- Todo el detalle de meses en docs/cruce-sistemas-anteriores.md.

## Archivos/Excels generados en PROYECTOS PAO
- Cruce Habbie - Natural Light.xlsx (reporte formal, saldo $33.883.565 a NL)
- Resumen cruce Natural Light.xlsx
- Conciliacion mayo 2026.xlsx / junio 2026.xlsx / julio 2026.xlsx
- Otros medios (Rappi-Addi) 2026.xlsx
