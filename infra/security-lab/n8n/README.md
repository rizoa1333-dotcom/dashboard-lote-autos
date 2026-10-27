# Runtime n8n: despliegues y remediacion

## Despliegue vigente — 27Oct2026

Servicio existente, despliegue `5ac7174f-61a9-4995-be51-038e097ce638`: **SUCCESS**.
Base oficial estable n8n **2.45.4**, fijada a
`sha256:80e23ced901f0e22597d4f3464e3aaf9d835372262ea6f08ef760d8ca35df25c`.
Se conservan las correcciones oficiales de Git, Handlebars y Nodemailer.
Los hashes de los consumidores Git se verifican sin adaptar su codigo en esta base.
Los adaptadores 2.44.6 se retienen solo para reproducir la candidata historica.

Parches adicionales, instalados desde lock independiente:

| Paquete | Version efectiva |
| --- | --- |
| body-parser | 2.4.0 |
| multer | 2.5.0 |
| follow-redirects | 1.16.1 en ambas copias |
| undici | 6.29.1 y 7.30.1, manteniendo separadas las ramas |
| brotli-libs | 1.2.1-r0 |
| libcurl | 8.23.0-r0 |

La base del proveedor carece de apk. Se copian temporalmente apk/libapk desde una
imagen oficial fijada por digest, se actualizan los dos paquetes con versiones
exactas y se retiran las herramientas. La candidata final conserva UID 1000;
la prueba comprueba que `/opt/velodrive-apk` no existe.

Pruebas reales sin Internet: JSON gzip valido 200, corrupto 400, limite
descomprimido 413; multipart valido y limite de foto 413; retirada de cabeceras
sensibles tras redireccion en las dos copias; ambas ramas Undici; Git, source
control HTTPS/SSH, 13 plantillas de correo, express-handlebars y LangChain.
Workflow local de n8n: rechazo y cancelacion temprana de respuestas grandes y gzip.

Respaldo fresco cifrado por TLS verificado y restauracion aislada. Las cinco
migraciones nuevas (311 a 316) se revisaron; el estado de partida no contiene
filas en agents/agent_history. Las huellas de workflows y credenciales se
conservan. La imagen anterior arranco sobre el esquema migrado sin retroceder
la base. Esto valida la reversion para el estado probado; usar funciones nuevas
de agentes, skills o promociones puede cambiar esa compatibilidad. No se ejecutan
migraciones DOWN destructivas como prueba ni sobre produccion.

Verificacion posterior: 16 workflows, 3 activos con las mismas versiones,
5 credenciales, 316 migraciones y las huellas de las 27 variables conservadas.
Readiness HTTP 200 y webhook WhatsApp sin autenticacion HTTP 401. Cero ejecuciones
nuevas/en curso al iniciar el cambio; no se leyo execution_data.

Escaneo del artefacto local exacto con base de avisos 27Oct13:12UTC:
**0 CRITICAL / 12 HIGH**, frente a 27 HIGH de la candidata anterior.
Es un escaneo de la candidata, no un SBOM extraido del contenedor servido.

Pendientes abiertos, sin overrides globales para ocultarlos:

| Paquete | HIGH | Condicion pendiente |
| --- | ---: | --- |
| @azure/msal-node | 2 | Probar intercambios OAuth simulados y conservar la rama 3 separada |
| MCP SDK/server | 4 | Versiones alineadas, limites explicitos y transportes concurrentes |
| toml | 4 | Probar parser 5.0.1 y el consumidor Snowflake |
| markdown-it | 1 | Comprobar tambien los bundles del editor ya compilados |
| zod | 1 | Migracion coordinada o backport; v4 rompe consumidores v3 |

La prueba Zod v4 mostro perdida silenciosa de restricciones con zod-to-json-schema;
por ello no se sustituye globalmente. Un `.max()` aplicado a arrays v3 tampoco
limita el trabajo previo: hacen falta presupuestos antes de validar cada entrada
alcanzable. La revision de estos 12 avisos sigue abierta.

## Despliegue anterior — 26Oct2026

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
