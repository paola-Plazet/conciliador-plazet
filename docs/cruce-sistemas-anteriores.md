# Cruce sistemas anteriores (Linux / Natural Light) — estado al 13-jul-2026

## Contexto
Paola tuvo 3 sistemas POS: **Linux** (facturaba Natural Light, hasta abr-may), **Alegra**
(desde fin abr/may según tienda, sigue siendo el contable) y **Karrot** (todas las tiendas
desde el **8-jul-2026**; desde esa fecha las ventas se toman de Karrot y se ignoran las
filas de Alegra ≥ 8-jul para no duplicar, porque los prefijos cambiaron).

- Efectivo de TODAS las tiendas (incluidas cerradas) empezó a entrar a la cuenta de Paola
  (encargo 10030039979 / ref consignación 100300399792) desde ~4-6 de abril.
- Regla acordada: **todo es de Paola desde el 16-abr** (JP desde el **16-may**). Lo anterior
  y lo de tiendas cerradas va al **cruce de cuentas con Natural Light**.
- Tarjetas de la época Linux las recaudó Natural Light y las devolvió en consignaciones
  grandes (abr-may). Paola sospecha que aún le deben parte.
- Éxito Occidente consignaba a otra cuenta (2600124347) que luego devolvió TODO:
  **$3.842.765 el 20-abr, exacto al peso** (aparece con ref 10030039979). ✔ verificado.
- Tiendas online en Karrot: "nl" (Natural Light) y "tienda shopify" (Plazet) — Paola pasará
  esos archivos después; por ahora solo tiendas físicas.

## Archivos (PROYECTOS PAO/muestras-conciliacion/)
- `sistemas anteriores/ventaSabmyju.xlsx` — ventas Linux abr-may, hoja "ventaSabmyju".
  Cols: FECHA (serial), SUC, FAC, NET, EFE, TAR (EFE+TAR=NET siempre). 4.088 facturas.
- `sistemas anteriores/consignaciones linux.xlsx` — hoja "consign".
  Cols: SU, NOMBRE, FEC.VENTA, FEC.CONSIG, VLR, NRO.DOC, CUENTA. Cuentas: 100300399792
  (Paola), 100300221336 (Natural Light, ventas hasta ~5-abr), 2600124347 (Éxito Occ).
- `sistemas anteriores/Alegra - Reporte de transacciones...xlsx` — Alegra corte 13-jul.
- `reporte_ventas_2026-07-01_2026-07-13.xlsx` — Karrot (hoja "Ventas", cols Pago Efectivo/
  Datafono/Transferencia/Bono/Online/Mercadopago; ubicaciones en minúscula por nombre).
- Banco efectivo abril-junio: hoja "ALIANZA EFECTIVO" de `Escritorio/conciliacion.xlsx`.

## Sucursales Linux (confirmado por Paola)
| SUC | Tienda | ¿De Paola? | Ventas Linux hasta |
|---|---|---|---|
| BQ | Unicentro Norte | Sí, desde 16-abr | 29-abr |
| Q9 | Unioccidente | Sí, desde 16-abr | 04-may |
| BD | Plaza de las Américas | Sí, desde 16-abr | 05-may |
| D0 | Jardín Plaza | Sí, desde 16-may | 27-may |
| BB | Éxito Occidente | No (cerró) | 15-abr |
| BC | Viva Envigado | No (cerró) | 22-abr |
| BF | Éxito Sabana | No (cerró) | 15-abr |
| BJ | Éxito San Pedro Neiva | No (cerró) | 15-abr |
| BM | Unicentro Cali | No (cerró) | 02-may |

## Referencias bancarias — mapa COMPLETO (identificado 13-jul por calce fecha+monto)
- 3105543462 → Unioccidente (Q9/B2)
- 3102874360, 3015140002 → Plaza (BD/B1)
- 3235896844, 3138845101 → Unicentro Norte (BQ/B3)
- **3209052268 → Unicentro Norte, ref vieja usada solo 8→13-abr**
- **3111234598 → Éxito San Pedro (cerrada)**
- **3203518392 → Éxito Sabana (cerrada)**
- **3172560775 → compartida Cali: Unicentro Cali (abril) y Jardín Plaza (desde 16-may)**
- **3165476343 → Unicentro Cali (1 mov, 7-abr)**
- **10030039979 → devolución cuenta Éxito Occidente (20-abr, $3.842.765)**
⚠ En la app la 3172560775 está asignada a JP: correcto hacia adelante, pero su plata de
abril es de Unicentro Cali (va al cruce Natural Light).

## Verificación ventas↔consignaciones↔banco (scripts linux-cruce1/2/3.ts)
- 89 de 105 depósitos a la cuenta de Paola calzan con el banco (por doc o combinados).
- **RESUELTO (14-jul, script nl-viva-verifica.ts): Viva Envigado SÍ consignó a Habbie
  $1.010.065 (ventas 6→16-abr)** — pero NO por referencia de recaudo sino como
  **"APORTE : BANCOLOMBIA"** directo al encargo (REF1: 010030039979-2). Los 10 depósitos
  calzan AL PESO con el banco (8→17-abr). El cruce por referencia no los veía: ese fue
  el origen del falso "nunca llegaron $945.715". Ventas BC 1→5-abr ($1.215.000 + 31-mar)
  fueron a la cuenta de NL; 17-18-abr ($73.150) no se consignaron a Habbie.
  ⚠ Lección: los recaudos pueden entrar como RECAUDO REFE **o** como APORTE Bancolombia.
- Éxito Sabana: $64.450 (consig 9-abr) sigue sin aparecer en el banco (no está ni en
  recaudos ni en aportes; el único aporte no-BC es un PSE de $10.000 del 7-abr).
- Unioccidente: 4-may banco recibió $900.300 vs $820.300 reportado → +$80.000 que
  compensa el faltante del 2-may. Neto cuadra.
- Días finales de venta de cada tienda no están en el archivo de consignaciones (se corta):
  Plaza 4-5-may (~$1.9M), JP 27-may ($340.900), BM 30-abr→2-may, etc. Verificar contra
  banco de mayo en el siguiente paso.
- Consignaciones del 31-mar (y previas) sin venta en el archivo: el archivo de ventas
  empieza 1-abr; no son descuadres.
- D0 tiene ventas EFE negativas 18 y 21-abr (devoluciones) — época en que JP no era de Paola.

## CRUCE NATURAL LIGHT — RESULTADO (calculado 14-jul-2026, scripts nl-cruce-cuentas.ts y nl-cruce-detalle.ts)

**Transferencias de NL recibidas (banco, "TI DEL ENCARGO ... NATURAL LIGHT"):**
16-abr $22.000.000 | 21-abr $31.000.000 | 24-abr $10.000.000 + $10.976.384 |
23-jun $2.904.813 → **R = $76.881.197**

**A. Efectivo que entró a Paola y es de NL = $29.024.187**
- A1 tiendas de Paola, ventas antes del corte (2→15 abr): BQ $5.262.745,
  Q9 $4.494.000, BD $5.122.827 = $14.879.572. (D0 no consignó a Paola antes 16-may ✔)
- A2 tiendas cerradas, lo que REALMENTE llegó al banco = $14.144.615:
  BJ $3.244.150 | BF $2.796.600 | BM $448.750 + $3.812.350 (ref compartida <16-may) |
  BB devolución $3.842.765. BC Viva Envigado $1.010.065 (llegó como APORTE Bancolombia,
  verificado al peso — ver arriba). BF: $64.450 del 9-abr sí sigue sin aparecer.

**B. Tarjetas (TAR) de tiendas de Paola desde el corte, época Linux = $66.815.348**
BQ 16→29-abr $17.328.377 | Q9 16-abr→4-may $20.309.650 | BD 16-abr→5-may $21.814.471 |
D0 16→27-may $7.362.850.
(Referencia: TAR pre-corte de sus 4 tiendas = $44.718.822; TAR cerradas+pre-corte total $96,4M.)

**AJUSTES CONFIRMADOS POR PAOLA (14-jul):**
- De las transferencias de NL, SOLO son devolución de tarjetas: 16-abr $22.000.000 y
  24-abr $10.976.384 → **R = $32.976.384**. Los $31M (21-abr) y $10M (24-abr) son OTRO
  concepto; los $2.904.813 (23-jun) fueron pago de una factura de pan que ella le vendió
  a NL. El TI.APORTE 13-may $2.510.721 fue una administración pagada por error y devuelta.
- Sus datafonos propios (Plink) SÍ operaron durante la época Linux → B se ajusta.

**Cruce Plink vs TAR Linux (script nl-plink-cruce.ts, calza AL PESO muchos días):**
Reportes Plink de MES COMPLETO ahora en muestras-conciliacion (0401-0430, 0501-0531,
0601-0630, 0701-0714). Activación datafonos propios CONFIRMADA: B3/Unicentro Norte
23-abr, B2/Unioccidente 24-abr, B1/Plaza 24-abr, **JP 16-may** (tal como creía Paola).
Días "mixtos" al inicio (operaban ambos datafonos en la tienda).

**B FINAL (tarjetas post-corte que SÍ recaudó NL) = $27.439.921**
(BQ $7.662.600 | Q9 $8.396.700 | BD $10.889.721 | JP $490.900 — solo dif. 18-19 may)
Ya le entró directo por Plink en esas ventanas ≈ $39.375.427.

**Corrección Viva Envigado (dato de Paola, 14-jul):** SÍ recaudó $1.010.065 (ventas
6→16-abr). No recibió: 1→5-abr $1.215.000 (fueron a cuenta NL) ni 17-18-abr $73.150.
→ BC entra al cruce con $1.010.065 y A sube a **$30.034.252**.

**AJUSTES 16-jul (confirmados por Paola):**
- Q9 1-may: hubo ventas DISTINTAS en Linux y Alegra el mismo día (no duplicadas),
  y las de Alegra entraron a DATAFONOS PROPIOS — en particular el terminal
  **31014111 "Principal"** (6 tx, $766.600, solo operó ese día; 5 pagos calzan
  exactos con Alegra por $647.800). NO se le cobran a NL. Quedan $571.525 de
  pagos Alegra 1-may sin transacción visible en ningún datafono propio
  (263.970+230.400+105.800+90.155 menos una tx PRIN de 118.800 sin pareja).
- Rappi (Alegra) le pagó a Natural Light: mayo $1.265.350 + junio $421.800 =
  $1.687.150 → entra al cruce a favor de Paola. Detalle en Excel
  `Otros medios (Rappi-Addi) 2026.xlsx`. Addi no aparece en Alegra.
  Mercadopago: jun $100.750 + jul(1-7) $3.360.897 — ¿a qué cuenta pagó? PENDIENTE.
- BQ 23-may: los $630.000 de Plink de más son ERROR DE DIGITACIÓN en el datafono:
  factura 2316-era... recibo 2193 por $71.201 cobrado como $701.201 (Mastercard
  débito). AL CLIENTE LE COBRARON $630.000 DE MÁS — revisar si se devolvió.

**RESULTADO FINAL DEL CRUCE (regla 16-abr):**
B $29.127.071 (tarjetas $27.439.921 + Rappi $1.687.150) − A $30.034.252 −
R $32.976.384 = **−$33.883.565 → PAOLA (HABBIE) LE DEBE A NATURAL LIGHT $33.883.565**

**REPORTE PARA ENVIAR A NL**: `PROYECTOS PAO/Cruce Habbie - Natural Light.xlsx`
(generado por scripts/nl-reporte-excel.ts, verificado por nl-reporte-verifica.ts:
todos los subtotales cuadran). 3 hojas: Resumen (regla, 3 secciones, saldo, exclusiones),
Detalle tarjetas (día a día TAR Linux vs datafono Habbie/NL), Detalle efectivo
(consignación por consignación pre-corte + cerradas con notas de BC y BF).

**Mapas mensuales de destino del dinero** (script nl-abril-mapa.ts [INI] [FIN]):
Abril: venta $199,0M → NL $130,2M (TAR $121,2M + EFE $9,0M) / Habbie $66,3M
(EFE $42,6M + Plink $20,1M + devol. BB $3,6M) / sin registro $2,5M.
Mayo (Linux 1→27): venta $31,7M → NL $8,4M TAR / Habbie $20,5M + $2,8M sin registro
en archivo pero verificado mayormente en banco (cortes del archivo de consignaciones).

**C. Jardín Plaza 16→27-may: consignaron COMPLETO, AL PESO** (6 depósitos ref
3172560775 del 19→28-may calzan exactos con los 12 días de venta EFE $3.792.100 ✔).
El dep 29-may $507.600 y siguientes son de la era Alegra de JP.

**Resumen final por tienda**: script nl-resumen-final.ts → genera el Excel
`PROYECTOS PAO/Resumen cruce Natural Light.xlsx` (hoja "Por tienda" + hoja
"Cruce Natural Light" con el saldo $-34.560.650 y las notas de lo que no entra).

**Pendientes:**
1. Confirmar con NL el detalle de sus $32.976.384 (¿con qué corte calcularon ellos?).
2. QR mayo: todos van a Bancolombia (confirmado Paola), pero venta QR Alegra
   $6.769.238 vs banco $6.369.273 → +$399.965 vendidos por QR sin entrar (y días
   sueltos descuadrados en ambos sentidos, ver hoja QR del Excel de mayo).
3. Mercadopago jun-jul $3,46M: ¿pagó a cuenta de Habbie o de NL?
4. BQ 23-may: verificar devolución al cliente de los $630.000 cobrados de más.

**VERIFICACIÓN ABRIL día a día (script abril-verifica-dias.ts, 16-jul): 172/185
días-tienda cuadran al peso.** Diferencias explicadas: BQ 23-abr $477.263 llegó al
banco el 27-abr (exacto); BD 13-abr $608.700 llegó el 14-abr; BM 14-abr $193.300
llegó el 15-abr; BD 16/17-abr ±$50.000 se compensan. Quedan (todas de tiendas
cerradas o época NL): BB 15-abr $28.500, BC 17-18-abr $73.150, BF $64.450,
BM cola 30-abr→2-may $276.700 no visible en banco (problema de NL). Plink BQ
29-abr +$27.100 (venta facturada al día siguiente).

**CONCILIACIÓN MAYO (script may-concilia.ts, 16-jul):**
- Arranque Alegra: BQ 30-abr, Q9 1-may, BD 6-may, JP 28-may. Q9 tuvo 1-may con
  venta EN AMBOS sistemas (efectivo real repartido; ojo tarjetas abajo).
- EFECTIVO: JP 16/16 ✔ | BQ 36/37 (queda 18-may $479.900 vs dep 20-may $469.001,
  faltan ~$10.899; y un dep extra 8-may $413.700 a favor) | Q9 19/31 días exactos
  pero dif neta solo +$131.647 A FAVOR (depósitos agrupan findes con desvíos
  chicos) | BD 20/31, depósitos SUPERAN ventas (+$538.500 el 4-may, −$720 el
  26-may que casi calza, resto ruido de agrupación).
- DATAFONO vs Plink: casi perfecto. Diferencias que quedan: BQ 23-may Plink
  +$630.000 (recaudo sin venta en Alegra — ¿venta sin facturar?); BQ 28/29-may
  ±$637.000 (corte de medianoche, se compensa); Q9 1-may Alegra registró
  $1.338.125 en tarjetas que parecen RE-REGISTRO de lo ya facturado por Linux
  (Plink solo trae lo de Linux) — confirmar con Paola; BD/JP días Linux = datafono
  NL (ya están en el cruce NL ✔).
- QR mayo (Alegra): BQ $412.600 | Q9 $3.984.239 | BD $3.340.950 | JP $799.300 —
  falta cruzar contra CSV 191 del banco (como en junio).

**CONCILIACIÓN JUNIO + JULIO 1→16 (16-jul, script jun-jul-reporte-dias.ts):**
Excel `Conciliacion junio 2026.xlsx` y `Conciliacion julio 2026.xlsx` (mismo formato
de mayo; julio incluye hoja "Tiendas online" NL/Shopify). Fuentes: Alegra ≤7-jul,
Karrot allsales 8→16-jul (por Nombre Almacén; Método de Pago Principal),
banco = hoja ALIANZA + movimientos (42).xls jul 1-16, Plink jun+jul, QR CSVs.
- EFE sin depósito (excluyendo 16-jul, que se consigna el 17): Q9 5→8-jun
  $2.330.722 | BD 2, 5, 7, 8 y 21-jun $3.806.410. CERO depósitos huérfanos.
- QR jun 1→jul 16: banco recibió $6.144.989 MÁS que la venta QR registrada →
  consistente con "efectivo consignado por QR" (hallazgo qrAlert de junio).
  La suma de días de EFE sin depósito de junio ($6,14M) ≈ el exceso QR. 2-jul y
  9-jul el banco QR es EXACTAMENTE el doble de la venta (¿pago QR duplicado?).
- Confirmaciones Paola 16-jul: Mercadopago es de HABBIE; en julio NL solo aplica
  si aparecen Rappi/Addi; ventas online "nl" se pagan por Mercadopago y algunas
  Addi → falta cruzar web vs Karrot (archivos web pendientes).

**CRUCE TIENDA WEB NL (17-jul, scripts nl-web-cruce.ts / nl-web-alegra.ts):**
Shopify transactions_export_1.csv (semicolon; #NL, Mercado Pago Checkout Pro +
Addi-Marketplace captures; PayU failures se ignoran) desde pedido #NL11623 vs
Karrot tienda "NL" (allsales) y Alegra (pre 8-jul).
- 21/21 pedidos del 2→7-jul ($3.219.850) están registrados en ALEGRA ✔ (era
  pre-Karrot). 48/75 calzan con facturas Karrot ✔.
- PENDIENTES en Karrot: #NL11667 13-jul $125.400, #NL11684 15-jul $55.900,
  #NL11686 15-jul $32.100 (¿no facturados?); #NL11695/96/97 del 16-jul en la
  noche ($230.950) probablemente facturados el 17 (backlog normal).
- Karrot sin pedido Shopify: fact 998 15-jul MP $341.700, fact 185 8-jul MP
  $115.250, fact 989 15-jul Transferencia $820.353 (¿venta directa/mayorista?).
- Alegra MP sin pedido NL: 3-jul $85.147, 7-jul $55.900, 8-jul $119.950
  (¿web Plazet/Shopify propia?).

**PLAN REPORTES MENSUALES (pedido por Paola 15-jul):**
- ABRIL: ya cubierto por el cruce NL (este doc + los 2 Excel en PROYECTOS PAO).
  Ambos Excel actualizados con Viva $1.010.065 y saldo −$35.570.715.
- MAYO: conciliación transacciones Alegra vs efectivo (banco) y datafonos (Plink
  0501-0531). Mes de transición: Alegra arrancó por tienda a distintas fechas.
- JUNIO: Alegra vs banco + datafonos (la app ya lo hace — ver test-junio.ts; Plink
  0601-0630 completo ya está en muestras-conciliacion).
- JULIO en adelante: Karrot (desde 8-jul) + Alegra hasta 7-jul.

Después: cruce de mayo (transición Alegra), tiendas online (nl/shopify) y reporte
diario por correo (pendiente previo).
