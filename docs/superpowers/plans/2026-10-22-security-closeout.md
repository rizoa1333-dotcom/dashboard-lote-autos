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
- [x] 2. Railway: verificar deployment, SHA de dashboard y CORS permitido/denegado. No reiniciar imagen vieja si no aplica variables nuevas.
- [x] 3. Checkout Sessions: tests RED de concurrencia/reintentos/QA; RPC de lease y sesion persistida; autorizacion/precio exclusivamente servidor. Adaptar webhook para sesiones nuevas y compatibilidad con compras previas. Permiso Stripe escritura Checkout requiere confirmacion concreta antes de ampliar clave.
- [x] 4. Registro: investigar ruta actual, definir journal service-only/recuperacion o transaccion soportada; tests RED de fallo de compensacion y reinicio. Sin almacenar contrasenas.
- [x] 5. Inventariar notificacion_auto_nuevo y retencion auxiliar mediante consultas de metadatos; restringir consumidores confirmados; no purgar historial sin autorizacion puntual.
- [ ] 6. Imágenes n8n/Evolution: inventariar tag/digest, producir SBOM y escaneo con herramienta oficial; fijar digest compatible sin actualizar a ciegas.
- [ ] 7. Documentos: limite de bytes antes de acumular upstream; restauracion en entorno aislado de respaldo cifrado, sin sobrescribir produccion.
- [ ] 8. Ejecutar pruebas, revision final, registrar aplicados/bloqueados y respaldar cambios.

## Ledger
- 2026-10-22: main remoto avanzó 3865df7 -> 9c82e45 sin force; rama fix/security-20261019 preservada. styles.css contiene cambio preexistente sin diff semantico.
- Ruling: conservar callbacks de Payment Links previos mientras migra Checkout; el corte solo se declara tras confirmar permisos y acceptacion real sin cobro.
- 2026-10-22: dashboard 9c82e45 verificado en produccion por SHA-256; 133 unitarias y 24 E2E aprobadas para Checkout durable. SQL de regresion probado con ROLLBACK; revision final sin bloqueos importantes. Feature flag permanece apagada hasta validar configuracion real.
- 2026-10-22: usuario autorizo Checkout Sessions escritura y Prices lectura en clave restringida de Railway. Sin nuevos pagos ni ampliacion de otros recursos.
- Ruling: para registro se sustituye la saga por trigger condicional AFTER INSERT de auth.users. Auth y lotes comparten Postgres: el trigger permite atomicidad real sin passwords persistidos ni cola de borrado. Solo campos comerciales/fiscales permitidos, profile_id de NEW.id y plan past_due impuesto. Riesgo: un error de trigger bloquea altas marcadas; verificar readiness antes de signup y probar rollback antes de activar.
- 2026-10-23: CORS efectivo restringido; instancia Connected en Evolution 2.3.7. Scanner oficial Trivy 0.76.1 verificado por digest; descarga de imagen falla por IPv6. Reintento no ejecutado: servicio de revision automatica sin cuota. No dar L02 por cerrado.
- 2026-10-23: registro atomico: 142 unitarias y 24 E2E aprobadas; regresion real ATOMIC_REGISTRATION_PASS_ROLLBACK. Trigger instalado y readiness=true, bandera aun apagada hasta desplegar backend. Revision detecto y se corrigio P1 de correo no confirmado: prueba de operation_id actual obligatoria antes de leer lote con service role. Re-revision sin bloqueos importantes.
- 2026-10-23: renovacion CLI autorizada explicitamente por usuario para workspace actual y dos proyectos; sesion vigente. Precios Stripe production=11600 MXN/mes y QA=10 MXN/mes verificados via API; permiso de escritura confirmado con solicitud incompleta sin crear Checkout. Servicio de aprobacion volvio a funcionar; reintento de escaneo IPv4 autorizado en curso.
- 2026-10-23 cierre de activacion: backend 14b9b90 desplegado con ATOMIC_REGISTRATION_ENABLED=true y STRIPE_CHECKOUT_SESSIONS_ENABLED=true. Registro real temporal HTTP 201; dos solicitudes Checkout concurrentes devuelven 502/200 por contencion del proveedor, reintento recupera la misma sesion y existe un solo journal. Sesion expirada deliberadamente y cuenta temporal retirada con comprobacion de nonce; cero pagos ejecutados. Cuatro Payment Links Live reutilizables desactivados desde Stripe; callbacks anteriores conservados. Nueva regresion elimina dependencia de sus IDs para la ruta durable.
- 2026-10-23 retencion: configuradas y verificadas por lectura READ ONLY de Postgres las cuatro opciones none/none/false/false en principal, incidentes y correo. Los tres siguen activos. No se purgaron ejecuciones previas. Webhook legado b171893b sin consumidor registrado; migracion reversible preparada y probada mediante ROLLBACK.
- 2026-10-23 contenedores: Evolution desplegado fijado por digest, 216 coincidencias HIGH/CRITICAL (8 criticas); candidato homolog no desplegado, 119 (2 criticas). n8n real 2.44.4 / Node 26.10.0 / UID 0; SBOM de 1853 componentes, 26 coincidencias (4 criticas). Imagen oficial candidata 2.44.6 fijada por digest, 24 coincidencias (las mismas 4 criticas). No actualizar a ciegas ni declarar cerradas estas vulnerabilidades.
- 2026-10-23: migracion del trigger legado aplicada tras rollback y revision independiente; tgenabled=D confirmado. Retencion auxiliar confirmada de nuevo en Postgres, tres workflows activos. Suite final del cambio: 145 unitarias y 24 E2E aprobadas.
- 2026-10-23: 521e985 desplegado con exito y nueva prueba real sin pago aprobada: registro 201, solicitudes 200/502, misma sesion, journal unico, sesion expirada y cuenta temporal retirada. Archivos remotos y clave SSH temporal eliminados; Railway confirma cero claves registradas.
- 2026-10-23: Railway resolvio Node 24.21.0 para 24.x. Fuente oficial Node indica parche de seguridad 24.22.1 publicado 2026-10-20; se fija version exacta y se valida binario Windows por SHASUMS256 oficial. 146 unitarias y 24 E2E aprobadas con 24.22.1. Despliegue del parche pendiente de verificacion. Usuario eligio entorno local gratuito para contenedores/restauracion: no crear recursos adicionales de pago en Railway.
