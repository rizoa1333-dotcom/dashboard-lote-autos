# Control de utilidad: correccion funcional

> Ejecucion inline mediante executing-plans, con regresiones RED/GREEN y revision independiente antes de integrar.

Objetivo: que una ganancia dependa de datos completos y una venta confirmada.
Arquitectura: modulo puro browser/Node, cantidades en centavos, agregacion O(vehiculos+gastos)
y espacio O(vehiculos). Mantener los endpoints, tablas y permisos RLS existentes.

Alcance: ganancia del vehiculo antes de impuestos y gastos generales no registrados.
No es utilidad neta contable ni gestion de cobranza. Costo cero legado se trata como
pendiente; consignaciones/vehiculos de costo realmente cero necesitan un modelo propio.
No editar estilos preexistentes, precios Stripe, flujos n8n ni registros productivos.

- [x] Escribir y observar regresiones de datos faltantes, precision, aislamiento y fechas.
- [x] Integrar el calculo unico y guardar con confirmacion explicita de venta.
- [x] Probar el flujo real de pantalla con servicios externos simulados: cancelar,
  confirmar, doble envio, desconexion, datos incompletos y cambio de contexto.
- [x] Revision independiente: foco tras refresco, lectura de gastos fallida, cierre
  por formulario general y confirmacion de escritura/refresco corregidos con RED/GREEN.
- [x] Ejecutar suite final:171 unitarias y34 navegador aprobadas el2026-10-25.
- [ ] Respaldar y comprobar despliegue publico.

Ruling: una respuesta antigua del mismo lote tampoco puede restaurar una ganancia
anterior. Generacion de lectura y version de contexto se comprueban despues de
ambas consultas. La respuesta nueva conserva prioridad; probado con lectura retenida.

Seguridad pendiente de la fase anterior: imagen Evolution no promovida, tres avisos
altos en candidata local; n8n cuatro criticos/veinte altos por corregir/mitigar;
recuperacion Evolution/Supabase y capacidad por comprobar. No confundir este modulo
con cierre de esos puntos.
