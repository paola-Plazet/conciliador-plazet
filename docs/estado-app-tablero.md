# Estado de la APP y el TABLERO — retomar aquí

Última sesión: 21-jul-2026. Paola reinició el computador. Retomar con:
**"retomemos el conciliador, lee docs/estado-app-tablero.md"**

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
