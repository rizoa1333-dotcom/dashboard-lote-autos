# Cierre de pendientes de seguridad de VeloDrive

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cerrar los riesgos documentados sin alterar precios, conversaciones ni conexiones existentes.
**Architecture:** Integrar primero la version validada. Cambios compatibles en backend y RPC service-only; leases durables para Checkout y recuperacion de registro. Despliegues por etapas con verificacion de estado efectivo.
**Tech Stack:** Node/Express, Supabase/Postgres, Stripe, n8n, Evolution, Railway.
**Spec:** docs/security-remediation-2026-10-20.md (tabla de hallazgos y evidencia posterior).

## Global Constraints
- Conservar importes existentes; QA solo cuenta autorizada. Sin cargos reales durante pruebas.
- Solo Facebook e Instagram. No modificar conexiones o datos de clientes ajenos a las pruebas.
- No secretos en logs, exportaciones entregables o Git. No recuperar passwords desde respaldos.
- Mantener la rotacion de tokens activa y preservar trabajo local preexistente en styles.css.

## Review Focus
- Dos ventanas/replicas pidiendo Checkout simultaneamente y timeout luego de crear la sesion.
- Caida entre crear Auth, insertar lote y compensar; nunca borrar cuentas ajenas o ya recuperadas.
- Webhook con evento antiguo, firma falsa o identificador de otro lote.
- Retencion y respaldo: no afirmar restaurable por el solo hecho de existir un archivo.
- CORS debe probarse en runtime, no solo leyendo variables guardadas.

## Tareas
- [x] 1. Integrar avance directo en main: verificar ancestro y push sin force; conservar rama de correcciones.
- [ ] 2. Railway: verificar deployment, SHA de dashboard y CORS permitido/denegado. No reiniciar imagen vieja si no aplica variables nuevas.
- [ ] 3. Checkout Sessions: tests RED de concurrencia/reintentos/QA; RPC de lease y sesion persistida; autorizacion/precio exclusivamente servidor. Adaptar webhook para sesiones nuevas y compatibilidad con compras previas. Permiso Stripe escritura Checkout requiere confirmacion concreta antes de ampliar clave.
- [ ] 4. Registro: investigar ruta actual, definir journal service-only/recuperacion o transaccion soportada; tests RED de fallo de compensacion y reinicio. Sin almacenar contrasenas.
- [ ] 5. Inventariar notificacion_auto_nuevo y retencion auxiliar mediante consultas de metadatos; restringir consumidores confirmados; no purgar historial sin autorizacion puntual.
- [ ] 6. Imágenes n8n/Evolution: inventariar tag/digest, producir SBOM y escaneo con herramienta oficial; fijar digest compatible sin actualizar a ciegas.
- [ ] 7. Documentos: limite de bytes antes de acumular upstream; restauracion en entorno aislado de respaldo cifrado, sin sobrescribir produccion.
- [ ] 8. Ejecutar pruebas, revision final, registrar aplicados/bloqueados y respaldar cambios.

## Ledger
- 2026-10-22: main remoto avanzó 3865df7 -> 9c82e45 sin force; rama fix/security-20261019 preservada. styles.css contiene cambio preexistente sin diff semantico.
- Ruling: conservar callbacks de Payment Links previos mientras migra Checkout; el corte solo se declara tras confirmar permisos y acceptacion real sin cobro.
- 2026-10-22: dashboard 9c82e45 verificado en produccion por SHA-256; 133 unitarias y 24 E2E aprobadas para Checkout durable. SQL de regresion probado con ROLLBACK; revision final sin bloqueos importantes. Feature flag permanece apagada hasta validar configuracion real.
- 2026-10-22: usuario autorizo Checkout Sessions escritura y Prices lectura en clave restringida de Railway. Sin nuevos pagos ni ampliacion de otros recursos.
