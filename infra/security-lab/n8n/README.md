# Runtime n8n: cambio aplicado el 2026-10-24

## Despliegue de seguridad vigente

Despliegue `4d3efb9b-c096-4d29-b7db-853b47e37f4f`: **SUCCESS**,
27Oct2026 UTC (26Oct por la noche en Mexico). Construido mediante el Dockerfile
de esta carpeta sobre la base oficial fijada, con el conjunto corregido descrito
abajo. La imagen oficial sin parches del apartado siguiente es el estado anterior.

Verificacion posterior: readiness HTTP 200; solicitud vacia sin autenticacion
al webhook de WhatsApp HTTP 401. Se conservaron por comparacion 16 workflows,
3 activos con las mismas versiones, 5 credenciales, 311 migraciones y las huellas
de las 27 variables configuradas. No se consultaron conversaciones.

La inspeccion adicional de hashes del contenedor por SSH no pudo completarse:
Railway rechazo la autenticacion de la clave temporal registrada. La clave se
revoco y se eliminaron sus archivos; Railway confirmo cero claves registradas.
Por tanto, el escaneo 0 CRITICAL / 27 HIGH corresponde al artefacto local probado,
no a un nuevo SBOM extraido del contenedor productivo.

El cambio se desplego exclusivamente en el servicio existente de n8n, sin crear
servicios cloud adicionales ni modificar Evolution. Los hallazgos HIGH, la
promocion de Evolution y la recuperacion completa siguen pendientes.

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

Actualizacion25Oct: nuevo escaneo del artefacto oficial exacto con base de avisos
25Oct19:10UTC arroja **4CRITICAL/27HIGH**. El recuento20HIGH anterior es historico.
Siguen criticas simple-git3.36.0, argv-parser1.1.1 y dos avisos de Handlebars4.7.9.
Simple-git4 cambia los imports: elimina default/require callable y conserva
`simpleGit` nombrado; no imponerlo a n8n sin adaptar y probar cada consumidor.
La version4.0.1 incluye argv-parser2.0.0, que no basta; la rama corregida debe
incluir argv-parser2.0.1. Ver [cambios oficiales](https://github.com/steveukx/git-js/blob/main/simple-git/CHANGELOG.md).
Handlebars corregido4.7.10 requiere pruebas del correo y consumidores de plantillas.
No se modifico la imagen productiva por esta inspeccion.

## Preparacion del parche — 26Oct2026

Nuevo escaneo de la misma imagen oficial, con base de avisos actualizada el
26Oct19:14UTC: **4 CRITICAL / 29 HIGH**. Los dos hallazgos adicionales son
libcurl 8.22.0-r0 (CVE-2026-92392; correccion 8.23.0-r0) y toml 3.0.0
(CVE-2026-114142; correccion 5.0.1). El ultimo implica un cambio mayor que
requiere identificar y probar consumidores; no sustituirlo globalmente a ciegas.

`package.json` define un conjunto independiente con versiones exactas:
simple-git 4.0.2, argv-parser 2.0.1 y Handlebars 4.7.10.
`harden-runtime.cjs` adapta el import del nodo Git y autoriza explicitamente
las variables que usan Git, source control y promociones. Exige las huellas
SHA256 de los tres archivos oficiales; rechaza cambios de version y de
estructura. No desactiva globalmente el guard de entorno de simple-git.

Validacion de la candidata `velodrive-n8n-security:qa-20261026b`:

- Lock independiente generado por npm; Dockerfile conserva la base oficial
  exacta y UID 1000. No cambia dependencias del dashboard.
- Prueba sin red de la clase Git real: repositorio local, commit y status.
- Promociones: nombre de rama valido/invalido y configuracion token/SSH.
- Source control: import dinamico nombrado y configuracion HTTPS/SSH.
- Doce plantillas reales de correo, express-handlebars y LangChain;
  comprobacion de escape HTML y bloqueo de propiedades heredadas.
- Workflow real local: limite HTTP y de respuesta gzip, cancelacion temprana.
- Respaldo nuevo por TLS verificado y cifrado directo AES256GCM. Restauracion
  sin Internet: 16 workflows desactivados, 5 credenciales descifrables,
  311 migraciones sin cambios, readiness correcto y UID 1000.
- Suite unitaria completa: 205 pruebas aprobadas; revision independiente
  sin bloqueantes. No se repitieron los E2E del dashboard por esta imagen.
- Escaneo del artefacto exacto: **0 CRITICAL / 27 HIGH**. Los HIGH siguen
  pendientes; esta correccion no constituye una certificacion de seguridad.

La primera descarga fue bloqueada por el limite de revision automatica;
se reanudo por el mecanismo normal cuando estuvo disponible. No se eludio.
El despliegue y su resultado se registran por separado al terminar la
comprobacion de produccion. Una subida del dashboard no actualiza esta imagen.

Referencia anterior de despliegue: 8a411ab9-370e-4e29-95e6-29adfef8f09b.
Railway expone deploymentRollback(id); su disponibilidad se consulto, pero no se
ejecuto una reversion en produccion como prueba. Si se necesita, verificar imagen,
variables, volumen y compatibilidad de esquema; no restaurar una base encima de
escrituras nuevas sin un plan de recuperacion.

Fuentes: [red privada](https://docs.railway.com/networking/private-networking),
[volumenes y ausencia de solapamiento](https://docs.railway.com/volumes/reference).
