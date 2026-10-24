# Runtime n8n: cambio aplicado el 2026-10-24

Servicio existente, sin servicios cloud adicionales:

- Imagen oficial: `n8nio/n8n@sha256:d02752c6ab446ae9db8deec2f9cc887c378f77cdcad31650814df936b7386dfb`.
- Version 2.44.6. Despliegue 6309cece-5bf4-406d-82a5-d7f23db016cb SUCCESS.
- Fuente anterior: plantilla externa con `FROM n8nio/n8n:latest` y `USER root`.
  Se retiro esa fuente mutable; no modificar la plantilla de un tercero.
- Postgres: `postgres.railway.internal:5432`. Tráfico interno cifrado por Wireguard
  segun la documentacion de Railway. No usa el proxy publico para la aplicacion.
- Proceso principal: UID 1000 comprobado en `/proc/1/status`. La sesion SSH de
  auditoria podia ser root; ese UID no debe confundirse con el del proceso servido.
- Volumen existente `/home/node/.n8n`, propietario 1000, directorio 0700 y config 0600.
  Solo se cambiaron metadatos de permisos, no se leyeron ni escribieron sus contenidos.

Comprobaciones anteriores al cambio:

1. Respaldo consistente por TLS verificado, cifrado AES256GCM y claves DPAPI.
2. Restauracion aislada de la copia mas reciente, sin Internet ni puertos publicados;
 16 workflows desactivados y 5 credenciales descifrables sin exportarlas en claro.
3. Arranque de esta imagen exacta como UID 1000 con la copia restaurada;
 311 migraciones antes y despues, sin migraciones nuevas.
4. Ruta privada probada en modo READ ONLY. Cero ejecuciones vivas al preparar
 permisos; los registros con deletedAt no nulo no son trabajos pendientes.

Comprobaciones posteriores:

- 24 variables conservadas por huella; clave de cifrado y tokens sin reemplazo.
- Mismos 16 workflows, 3 activos, 5 credenciales y 311 migraciones.
- Flujo principal publicado con 210 nodos y limite documental presente en version activa.
- Panel de WhatsApp 200/conectado. Mensaje real ejecucion 21740: 1 entrada, 1 respuesta,
 0 incidentes; usuario confirmo entrega.
- Alerta controlada de soporte 21854 aceptada y recibida por el destinatario.
- Clave SSH temporal revocada; Railway confirma cero claves registradas.

La imagen conserva 4 coincidencias CRITICAL y 20 HIGH del escaneo. Fijarla y retirar
root no corrige automaticamente esas dependencias: mantener evaluacion de alcance
y remediacion pendientes. Tampoco afirmar recuperacion completa de Supabase/Evolution.

Referencia anterior de despliegue: 8a411ab9-370e-4e29-95e6-29adfef8f09b.
Railway expone deploymentRollback(id); su disponibilidad se consulto, pero no se
ejecuto una reversion en produccion como prueba. Si se necesita, verificar imagen,
variables, volumen y compatibilidad de esquema; no restaurar una base encima de
escrituras nuevas sin un plan de recuperacion.

Fuentes: [red privada](https://docs.railway.com/networking/private-networking),
[volumenes y ausencia de solapamiento](https://docs.railway.com/volumes/reference).
