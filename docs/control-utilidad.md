# Control de utilidad

## Uso

1. Abre Control de utilidad y selecciona Editar compra / venta en la unidad.
2. Captura el costo real de compra. Deja vacia la venta mientras siga en inventario.
3. Registra los gastos de la unidad: reparacion, estetica, tramites u otros.
4. Al vender, captura precio y fecha reales; confirma la venta al guardar.

Ganancia del vehiculo = precio real de venta - compra - gastos registrados.
Es una medida antes de impuestos y gastos generales no registrados. Ventas
acumuladas son ingresos registrados, no ganancia ni saldo de caja cobrado.
Capital en patio suma compras capturadas de unidades que no estan vendidas.
El resumen mensual agrupa por fecha de venta y resta los gastos actuales de cada
unidad, incluso si se capturaron despues; no implementa cierres contables de periodo.

## Datos incompletos

Un costo cero legado se considera pendiente de captura, no una compra gratuita.
No se calcula ganancia sin compra/precio real o sin una lectura valida de gastos.
Las ventas sin fecha valida no se asignan al alta ni al mes actual. La fecha puede
corregirse en el formulario financiero; no se permite una fecha futura al guardar.
Los importes negativos de ganancia son perdidas y se conservan como tales.

Si una escritura confirma pero falla el refresco, se indica que ya quedo guardada.
Actualizar datos consulta de nuevo; no vuelve a registrar gastos. La pantalla
invalidada no conserva una ganancia anterior presentada como actual.

## Alcance y limites

- Compras/gastos/ventas son capturas internas del propietario. No generan CFDI,
  no concilian bancos, ni gestionan anticipos, parcialidades o consignaciones.
- Costo de compra realmente cero requiere modelado explicito distinto del cero
  predeterminado legado; este flujo exige costo positivo para cerrar una venta.
- Importes individuales respetan numeric(12,2), con aritmetica en centavos e
  inspeccion de desbordamiento en totales. Agregacion O(vehiculos+gastos),
  memoria O(vehiculos); las fechas SQL DATE se tratan como fechas civiles.
- Autorizacion sigue en Supabase/RLS. Los filtros id+lote y la confirmacion de una
  fila actualizada complementan esa politica; el modulo de calculo no la reemplaza.
- Bloqueo local previene doble clic mientras se guarda. No equivale a un journal
  durable de solicitudes de gasto ante cierre del navegador o respuesta perdida.

## Validacion local

Pruebas unitarias de centavos, datos incompletos, perdidas, filtro lote/gasto,
fechas y confirmacion. Pruebas de navegador para cancelar/confirmar, doble envio,
desconexion, gasto guardado con refresco fallido (error/excepcion), recuperacion,
flujo de edicion general, teclado/foco y movil390px.

La comprobacion visual usa servidor HTTP local, recursos reales y CSP sin relajar;
solo se simulan servicios externos y datos del lote. No se insertaron operaciones
financieras en produccion. Colores de texto revisados contra #12151C:
#9CA3AF7.19:1, exito#4B8B724.55:1, perdida#E5573F5.02:1. Esto no certifica
accesibilidad de todos los modulos de VeloDrive.
