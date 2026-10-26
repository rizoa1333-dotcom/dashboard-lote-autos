# Ventas mensuales

Sustituye Control de utilidad desde el 26 de octubre de 2026. No muestra compras,
gastos ni ganancias. Los registros historicos de costos y gastos permanecen en
la base de datos; el panel ya no consulta car_expenses.

1. En Inventario, pulsa Marcar Vendido.
2. Captura el precio real y la fecha de venta. Confirma la operacion.
3. Consulta Ventas mensuales: año, mes, cantidad de unidades, importe total,
   vehiculo, fecha, precio individual e identificador de inventario.
4. Editar venta permite corregir precio/fecha sin introducir costos de compra.

Los importes se suman en centavos enteros. Una venta sin precio no usa el precio
de catalogo como sustituto: su mes muestra que faltan precios. Una venta sin
fecha valida queda pendiente de completar, sin asignarle created_at ni la fecha
actual. Fechas futuras no se aceptan. Las ventas de diferentes años no se mezclan.

Guardar esta informacion no acredita haber recibido el dinero ni genera una
factura; el panel muestra el registro de la venta. No calcula utilidad fiscal.

La escritura conserva los filtros de id y lote_id, verifica una fila actualizada
y bloquea doble envio. Si la escritura termina pero falla el refresco, informa
Venta guardada y solicita actualizar el listado sin volver a registrar la venta.
El modo catalogo oculta las ventas y conserva la proyeccion sin precios de venta.

Se retiro la hora de llegada de los leads de tablas y tarjetas; las horas de las
citas se conservan. El mensaje global de sincronizacion queda oculto durante
carga/exito y solo aparece ante errores. Los botones mantienen su progreso local.

Verificacion previa al despliegue:199pruebas unitarias y38E2E aprobadas,
incluyendo ventas sin compra, cambio de año, fechas/precios pendientes, offline,
doble envio, cierre/cambio de vehiculo durante guardado, aislamiento del catalogo,
foco de teclado y ancho movil390px. Capturas revisadas en escritorio y movil.
Complejidad del reporte:O(n log n) en el peor caso por ordenar las ventas dentro
de cada mes y O(n) memoria; las consultas siguen limitadas al lote autenticado.
