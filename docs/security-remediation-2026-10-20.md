# Estado de remediacion de seguridad - VeloDrive

Fecha: 2026-10-20. Rama: fix/security-20261019. Este documento complementa la auditoria del 18-10; no equivale a una certificacion de ausencia de vulnerabilidades.

## Evidencia actual (actualizada 2026-10-25)

- 171 pruebas unitarias y 34 Playwright aprobadas. E2E usa servicios externos simulados; pruebas reales adicionales se distinguen en el historial inferior. Sin nuevos cargos.
- Control de utilidad corregido y revisado localmente: centavos, datos incompletos, fechas reales, confirmacion de venta y recuperacion de refresco. Despliegue de este cambio pendiente de verificar; ver docs/control-utilidad.md. No se insertaron gastos/ventas productivos durante QA.
- Auditoria npm de la aplicacion sin vulnerabilidades reportadas. Escaneos separados de n8n/Evolution si contienen hallazgos pendientes; no extrapolar el resultado de npm a todo el sistema.
- Registro atomico y Checkout durable probados contra servicios reales sin cobrar; enlaces de compra Live heredados desactivados.
- Flujo documental publicado y verificado con 210 nodos. n8n 2.44.6 fijado por digest, proceso principal UID 1000, Postgres privado y 24 variables conservadas por huella. Tres workflows activos; cinco credenciales y 311 migraciones conservadas.
- Prueba real tras el cambio de n8n: ejecucion 21740, 1 entrada/1 respuesta/0 incidentes; usuario confirmo entrega. Alerta controlada aceptada en ejecucion 21854 y destinatario confirmo recepcion. SSH temporal revocado.
- Siete comprobaciones reales de autenticacion rechazaron solicitudes sin sesion, firma o clave: editor n8n, webhooks WhatsApp/citas/QR, portal Stripe, webhook Stripe y Evolution. Sin mensajes, cargos ni lectura de conversaciones.
- Evolucion de imagen Evolution: tercera candidata local2.3.7 con0 CRITICAL/3 HIGH (rondas anteriores69 y20 HIGH); produccion aun conserva el digest anterior con8 CRITICAL/208 HIGH. Compatibilidad de medios, HTTP, Chatwoot, Socket.IO y contexto concurrente probada en aislamiento, ademas de arranque y57 migraciones. No se declara lista para distribuir por el solo hecho de pasar pruebas funcionales.

## Hallazgos

| ID | Estado | Evidencia o condicion pendiente |
|---|---|---|
| C01 | Corregido en app | proxy-addr 2.0.8; audit limpio; imagenes externas fuera de alcance |
| H01 | Corregido en flujo actual | Stripe Trigger de n8n desactivado y desconectado; backend es escritor del flujo actual; dos destinos antiguos deshabilitados. Destino restante 7c40 identificado por el usuario como prueba de VeloDrive y deshabilitado; solo el destino actual queda activo |
| H02 | Corregido en rutas actuales | Firma/referencia/precio validados; reconciliacion contra estado actual con claim y commit fenced en DB. No probado mediante un nuevo cobro real |
| H03 | Corregido en canales identificados | Secretos separados; headers verificados antes de procesar; query secret y variable compartida retiradas. Trigger legado sin consumidor deshabilitado reversiblemente y verificado |
| H04 | Corregido y verificado | Usuario revoco default secreta; comprobacion directa: clave anterior HTTP 401, nueva HTTP 200; WhatsApp sigue conectado. Workflow legado despublicado y saneado |
| H05 | Corregido en rutas identificadas | 15 politicas restrictivas de plan para escritura y gates premium en automatizaciones. QR exige plan activo; cualquier onboarding alternativo debe mantener politica explicita |
| H06 | Corregido | Herramientas de agente usan agent_inventory, proyeccion sin costos privados y filtro de lote |
| M01 | Corregido para ejecuciones nuevas | Principal y dos auxiliares none/none/false/false verificados. Historial anterior no purgado; no afirmar eliminacion retroactiva de datos |
| M02 | Corregido | Revocados TRUNCATE/TRIGGER/REFERENCES de clientes y privilegios por columna |
| M03 | Corregido | chat_history modificable solo por servidor; cliente conserva lectura autorizada |
| M04 | Corregido | Restriccion de rol admite user/model/human |
| M05 | Corregido y aplicado | Registro atomico Auth+lote por trigger condicional; rollback real y readiness verificados. No depende de borrado compensatorio para nuevas altas marcadas |
| M06 | Corregido y desplegado | AbortController/generaciones y limpieza de cuenta/documento; pruebas de logout y cambio Auth; archivos productivos comprobados |
| M07 | Corregido y desplegado | Catalogo solo columnas comerciales, sin CRM/gastos; sigue siendo presentacion del propietario, no un sitio publico |
| M08 | Parcial, publicado | Archivo10MiB validado; transporte n8n limita JSON descomprimido antes de acumular; sin redirects y reintento seguro. No incluye antivirus ni limita por si mismo el buffering interno de Evolution |
| M09 | Corregido y desplegado | CSP y recursos locales verificados; estilos inline heredados aun permitidos |
| M10 | Parcial, desplegado | API interactiva limitada; health/Stripe separados. Almacenamiento compartido y capacidad bajo concurrencia pendientes; no afirmar escalamiento horizontal |
| M11 | Corregido y aceptado | CORS restringido, credentials=false, Origin fijo en consumidores autorizados; panel y respuesta WhatsApp reales comprobados |
| M12 | Corregido en produccion | FK compuesta validada; cero incoherencias previas. Prueba service_role RED antes y GREEN despues, con ROLLBACK: rechaza insercion cruzada/reasignacion y conserva cascada original |
| L01 | Corregido en funciones identificadas | search_path fijo y permisos de ejecucion restringidos; trigger de citas usa Vault |
| L02 | Parcial | n8n oficial fijado y sin root; conserva4 CRITICAL/20 HIGH por evaluar. Evolution productivo fijado pero con8 CRITICAL; candidata corregida aun local. Ver reportes separados |

## Riesgos residuales que impiden afirmar cierre total

1. Cerrar o mitigar con evidencia las dependencias vulnerables de los contenedores. La candidata Evolution no se considera desplegada.
2. Completar recuperacion de Evolution/Supabase y custodia independiente de claves de respaldo. La restauracion comprobada de n8n no cubre todo el sistema.
3. El limite del cliente HTTP n8n no impide que Evolution acumule previamente un medio grande; revisar esa ruta del proveedor.
4. Probar carga/concurrencia antes de declarar capacidad comercial para un numero de lotes. La prueba funcional no es una prueba de capacidad.
5. Mantener pruebas de tenant por operacion, firma/precio Stripe y recuperacion de errores en cada cambio posterior.

## Orden siguiente

Remediar y probar Evolution; evaluar dependencias criticas restantes de n8n;
cerrar recuperacion y aceptar flujos reales finales. Mantener cambios pequenos,
reversibles y limitados a los modulos afectados. Los apartados inferiores conservan
el historial fechado, incluidos bloqueos que ya fueron resueltos.

## Bloqueo de despliegue del panel

Railway rechazo railway up con UPLOAD_FAILED: Deploys have been paused temporarily. La pagina oficial https://status.railway.com confirma pausa global de nuevos builds el 20-10-2026 y que los servicios existentes siguen operativos. El intento no genero deployment nuevo; la app sigue en c3230c6. No presentar M06/M07/M10 como aplicados hasta desplegar y verificar los hashes de dashboard.js/ui-feedback.js y el comportamiento HTTP. n8n y la migracion M12 si estan publicados/aplicados.

## Costos de ejecucion

Invalidacion de solicitudes O(1); limpieza/proyeccion del catalogo O(n) en vehiculos con numero fijo de columnas. Validacion documental O(n) en bytes, con limite 10 MiB y rechazo por longitud antes de decodificar. La validacion de firma de formato no sustituye analisis antivirus ni impone un limite de streaming a la respuesta upstream de Evolution.

## M09: navegador y recursos locales

Revision independiente sin hallazgos importantes pendientes. Se conservaron la cascada y especificidad del CSS; el fallback de PDF usa un listener delegado en lugar de onerror inline. npm audit completo: cero vulnerabilidades (incluido desarrollo). No se afirma despliegue hasta comprobar CSP y hashes en produccion.

## Despliegue verificado 2026-10-21

Railway deployment 87e18257-61d0-41aa-abee-9168c5e31e1c SUCCESS, codigo 69d90e8. dashboard.js, ui-feedback.js, utilities.css y SDK local: HTTP 200, MIME correcto y SHA-256 identico al checkout. HTML HTTP 200 con CSP aplicada, sin CDN Tailwind. M06/M07/M09 y limitacion local M10 ya desplegados; alcance residual de cada hallazgo permanece.

Diagnostico pendiente: credencial nativa Supabase account 2 muestra fallo de conexion; usuario debe actualizar referencia a la variable vigente y guardar. No afirmar agente/marketing aceptados hasta repetir verificaciones. Upload-Post responde HTTP 200 con perfiles IG/FB configurados sin reautenticacion, historial vacio; aun no atribuida la causa del error al publicar.

## M11: configuracion pendiente de reinicio

Railway guarda CORS_ORIGIN=https://evolution-api-production-3652.up.railway.app y CORS_CREDENTIALS=false. La prueba real aun refleja origen arbitrario y credentials=true: NO cerrado. railway redeploy rechazo el reinicio con Deploys have been paused temporarily. Canal WhatsApp sigue conectado. Reintentar reinicio autorizado y comprobar preflight permitido/no permitido antes de marcar aplicado.

## Publicacion: diagnostico seguro 2026-10-21

La captura del usuario del 19-10 muestra el mensaje estatico del evaluador posterior al HTTP Upload-Post, no un error de carga local ni prueba de fallo Supabase. Se publico solo el cambio de Evaluar Envio de Publicacion (version 7d1065b2): clasifica 400/401/403/404/429, conserva request_id y respuesta incierta, no propaga payload sensible. Revision independiente sin hallazgos importantes; 120 unitarias y 22 E2E aprobadas.

Validacion real sin posibilidad de publicar: multipart con plataforma deliberadamente invalida devuelve HTTP 400 Invalid platforms; confirma autenticacion y lectura de multipart por proveedor, sin request_id aceptado. No demuestra causa del fallo original ni publicacion exitosa. Historial del proveedor vacio; requiere nuevo intento autorizado y lectura del resultado.

## Transporte de publicaciones corregido y publicado 2026-10-21

Causa reproducida en el nodo HTTP: Upload-Post devolvia HTTP 400 `Username required in form data` con el cuerpo multipart raw. Anadir Content-Length o enviar el mismo cuerpo como binario no resolvio el rechazo. El formulario multipart nativo de n8n si fue interpretado correctamente. Se sustituyo solo `Publicar Upload-Post (Fotos)1`, conservando autenticacion, identidad de lote validada, plataformas seleccionadas, fotos separadas, request_id e idempotencia.

El formulario conserva una coleccion estatica de 16 campos para evitar la incompatibilidad del editor con colecciones expresadas dinamicamente. Los campos de fotos/plataformas no utilizados reciben nombres propios vacios; la prueba real con la plantilla completa, Unicode y dos fotos fue rechazada unicamente por la plataforma deliberadamente invalida. No publico contenido ni obtuvo request_id aceptado.

Respaldo antes de importar: exportacion (22), copia ignorada .qa/main-before-native-publication.json. Exportacion posterior (23) comparada por nombre: 210 nodos, conexiones, credenciales, estados disabled y settings conservados; unicamente se normalizaron los defaults formData/autodetect del nodo modificado. Version `Publicaciones: formulario multipart nativo - 2026-10-21` activada; UI confirma Published.

Validacion actual: 121 unitarias y 22 E2E aprobadas. El usuario hizo un solo intento real y recibio `En proceso`; la publicacion final por plataforma todavia requiere Verificar Meta. No equivale a publicacion confirmada. La sesion Railway CLI vencio al repetir las pruebas autenticadas de webhooks; esa comprobacion no se completo y no invalida ni reemplaza evidencia previa.

Complejidad del constructor O(1) por limites fijos de 2 plataformas y 10 fotos; transferencia O(B) en los bytes enviados. La confirmacion asincrona debe mantener request_id y verificar resultados individuales antes de marcar publicado_meta.

## Aceptacion real por plataforma y credencial 2026-10-21

Consulta de solo lectura limitada al lote QA: proveedor HTTP 200, status completed, total 2; Instagram success=true y Facebook success=false. Facebook devuelve config_target_missing / platform_api: no hay Facebook Pages asociadas o seleccionadas; perfiles personales no admitidos. El transporte ya funciona y no debe repetirse el envio a Instagram. Falta seleccionar/reconectar una Pagina autorizada y probar solo Facebook.

Credencial nativa Supabase account 2 validada en ejecucion real mediante getAll con instance_name de prueba inexistente. Operacion exitosa sin recuperar registros. La vista previa roja por acceso UI a variables no representaba fallo de ejecucion. Flujo QA manual sin webhook publico ni retencion de ejecuciones; debe archivarse al cerrar el diagnostico.

Limpieza QA: archivados recuperablemente ambos flujos temporales (transporte y estado/credencial), sin publicar webhooks de prueba. Upload-Post UI confirma que Choose Facebook Page solo ofrece Default (auto), sin Paginas disponibles. Pendiente respuesta del propietario con la Pagina que debe autorizarse; no se desconecto Instagram ni se republico contenido.

## Facebook y respuesta de estado 2026-10-22

Con autorizacion expresa para las condiciones de Meta, creada la Pagina de prueba Angel Rizo (perfil publico 61595772989852, asset 1322392660965777), categoria Producto/servicio y descripcion de prueba. Sin publicar datos personales de contacto. Upload-Post encontro la nueva Pagina con los permisos existentes y se selecciono Angel Rizo; Instagram permanecio conectado.

El usuario envio una publicacion nueva solo a Facebook. Verificacion directa en la Pagina: Nissan Versa Advance DEMO 2022, Publicado por upload-post, visibilidad Publico. Esto confirma el transporte y destino de Facebook; Instagram ya estaba confirmado por la prueba previa. No se republico desde el agente ni se repitio el envio anterior.

Se publico en n8n un cambio limitado a Evaluar Resultado1: devuelve resultado parcial por red y un mensaje concreto de Pagina faltante; lista permitida de campos excluye email, captions, tokens y errores crudos. Comparacion entre exportaciones (23) y (24): 210 nodos, solo parametros del evaluador cambiados; credenciales, conexiones y settings conservados. Indentacion del editor normalizada para cotejar codigo local. Version Estado de publicacion por red sin payload sensible - 2026-10-22, UI Published.

Panel local: muestra Publicacion parcial y el mensaje por red, sin reenviar fotos al consultar. 122 pruebas unitarias y 23 E2E aprobadas; nueva regresion comprueba cero POST de publicacion durante consulta. El cambio de dashboard.js todavia NO desplegado. Railway muestra incidente de plataforma y Redeploy deshabilitado. Preflight actual Evolution continua reflejando origen externo con credentials=true: M11 sigue abierto. No se reinicio innecesariamente el servicio activo.

Normalizacion del estado O(n) en resultados del proveedor y O(n) de memoria; el servicio admite dos plataformas. Pruebas temporales anteriores permanecen archivadas. Evidencia actual en .qa/evidence (ignorada por Git).

## Cierre verificado 2026-10-22: panel, CORS y Checkout

Main avanzo sin force hasta dafbde5. dashboard.js servido por Railway devuelve HTTP 200, MIME JavaScript y SHA-256 identico al commit. Esto incorpora el estado parcial de publicaciones y los cambios del panel anteriores.

Evolution desplegado con referencia fija evoapicloud/evolution-api@sha256:966625532d9076a2381e973a271307d107e6f070450de3abeeea8bd18be07252. UI: Deployment successful. Preflight real permitido: HTTP 204 y origen exacto del manager; origen https://untrusted.invalid: HTTP 500 sin Access-Control-Allow-Origin ni Allow-Credentials. El rechazo usa una respuesta 500 poco descriptiva, pero no concede acceso cruzado. Manager confirma version 2.3.7 e instancia QA Connected. M11 cerrado para origenes comprobados; CORS no sustituye autenticacion.

Checkout durable: 133 unitarias y 24 E2E aprobadas, regresion SQL real con ROLLBACK aprobada y revision sin bloqueos importantes. Migracion supabase_security_checkout.sql aplicada: RLS, tabla y RPC exclusivas de service_role. Claim por lote, clave idempotente de Stripe, reconciliacion de respuesta perdida, consumo atomico con aplicacion de suscripcion y nueva contratacion tras cancelacion confirmada. Complejidad habitual O(1); recuperacion excepcional O(n), limitada a 1000 sesiones consultadas y fallo cerrado si se excede.

Activacion pendiente: Stripe no conservo los dos permisos autorizados al guardar mediante navegador; usuario debe completar guardado. Se preparan precios existentes sin crear nuevos productos. STRIPE_CHECKOUT_SESSIONS_ENABLED permanece ausente/desactivado. Por tanto el riesgo residual de Payment Links aun NO se declara cerrado. No se ejecuto ningun cobro.

## Registro atomico y permisos confirmados 2026-10-23

Usuario completo el guardado de Stripe. Lectura posterior confirma Checkout Sessions Escritura y Prices Lectura. API verifica ambos precios activos: 11600 MXN/mes produccion y 10 MXN/mes QA. POST incompleto a Checkout devuelve error de parametro (no error de permisos), sin crear sesion ni ejecutar cobro. Variables de precio preparadas en Railway; activacion del Checkout aun pendiente.

Registro: supabase_registration_atomic.sql instalado tras regresion SQL real con ROLLBACK. Auth y lote se crean en la misma transaccion; falla de lote u operation_id repetido no deja usuario. Metadata no puede imponer profile_id, plan activo, suscripcion ni webhook_token. Identidad del lote siempre NEW.id, plan inicial past_due. Tabla de operaciones con RLS y acceso solo servidor. readiness=true comprobado en Supabase.

La revision encontro P1 en el codigo nuevo, antes de activarlo: Supabase puede devolver usuario no confirmado existente con identities no vacio. Corregido exigiendo la operacion aleatoria actual en registration_security_operations antes de leer cualquier lote con service role. Prueba de regresion aprobada; re-revision sin bloqueos importantes. Suite: 142 unitarias y 24 E2E aprobadas. Backend nuevo y ATOMIC_REGISTRATION_ENABLED pendientes de despliegue; no declarar M05 cerrado hasta verificar ruta efectiva.

## Activacion efectiva y evidencia de cierre parcial 2026-10-23

Este apartado sustituye los estados pendientes de activacion de las secciones anteriores. Backend 14b9b90 desplegado; registro atomico y Checkout durable habilitados. Prueba real temporal: registro 201, Checkout concurrente 502/200, reintento con la misma URL y un solo registro durable. El 502 procede de la contencion idempotente del proveedor; mejora UX pendiente para ese caso, sin duplicacion observada. Stripe confirmo sesion open; se expiro y se retiraron exclusivamente Auth/lote temporales identificados por nonce. No se pago ninguna sesion. Evidencia privada ignorada: `.qa/evidence/live-registration-checkout-20261023.json`.

Los cuatro Payment Links Live reutilizables que seguian activos fueron desactivados recuperablemente en Stripe. No se cancelaron suscripciones. Se conserva la validacion de callbacks anteriores y se normaliza su allowlist. La ruta nueva no depende de Payment Links ni del secreto usado para firmar referencias antiguas; sigue validando JWT, propietario, correo y acceso QA antes de crear Checkout. Dos regresiones nuevas cubren ausencia de configuracion heredada y creacion efectiva simulada para produccion/QA. Revision independiente sin hallazgos importantes.

Flujos principal, incidentes y correo: lectura READ ONLY de la BD confirma activos con saveDataErrorExecution=none, saveDataSuccessExecution=none, saveManualExecutions=false, saveExecutionProgress=false. Cambios auxiliares limitados a esas cuatro opciones, sin alterar nodos, conexiones, horarios ni credenciales. El generador preserva esta politica y hay regresion automatizada. No se borraron ejecuciones historicas. La vigilancia conserva incidentes saneados en Supabase y el envio por Resend.

Inventario: notificacion_auto_nuevo enviaba filas cars al webhook b171893b-1b1c-4ee6-9b92-970a1a849b7c, sin consumidor registrado en la instancia n8n actual. Migracion supabase_disable_legacy_inventory_webhook.sql revisada y probada con ROLLBACK, despues aplicada: tgenabled=D confirmado. Guarda estricta de tabla/nombre/funcion/destino base; conserva definicion, vehiculos y demas triggers. Reversion posible con ALTER TABLE public.cars ENABLE TRIGGER notificacion_auto_nuevo solo despues de autorizar y autenticar un consumidor. Pruebas actuales: 145 unitarias y 24 E2E, sin fallos.

## Inventario real de contenedores 2026-10-23: riesgo abierto

Trivy oficial 0.76.1 verificado contra digest SHA-256 del release. SBOM de n8n generado dentro del contenedor excluyendo /home, /data, /root y otros volumenes/directorios operativos; solo scanner de vulnerabilidades, sin extraccion de secretos. Analisis local contra base descargada. Una advertencia de la base sobre CVE-2026-107891 sin detalles limita la cobertura; no se interpreta como ausencia de riesgo.

| Objetivo | Referencia/estado | Coincidencias criticas | Altas |
|---|---|---:|---:|
| Evolution desplegado 2.3.7 | sha256:966625532d9076a2381e973a271307d107e6f070450de3abeeea8bd18be07252 | 8 | 208 |
| Evolution homolog candidato, NO desplegado | sha256:1e656f95aa1a2b7c2455a6a36d654637ddc2658c263794a5074ada798412a549 | 2 | 117 |
| n8n real 2.44.4 / Node 26.10.0 | Imagen construida por Railway, UID 0, SBOM 1853 componentes | 4 | 22 |
| n8n oficial 2.44.6 candidato, NO desplegado | sha256:d02752c6ab446ae9db8deec2f9cc887c378f77cdcad31650814df936b7386dfb | 4 | 20 |

Son coincidencias paquete/version/aviso, no necesariamente CVEs unicas ni prueba de explotacion. Requieren revisar alcance, dependencia utilizada y mitigaciones; no se declaran corregidas por fijar un digest.

Criticas Evolution desplegado: baileys 7.0.0-rc.9 (CVE-2026-48063, corregido en 6.7.22/7.0.0-rc12); fast-xml-parser 4.5.3/5.2.5 (CVE-2026-25896); protobufjs 6.8.8/7.5.4 (CVE-2026-41242); proxy-addr 2.0.7 (CVE-2026-90711); tar 7.5.11 (CVE-2026-59873); stdlib Go 1.23.12 en herramienta empaquetada (CVE-2025-68121). Protobuf requiere control del esquema/descriptor: no equivale a ejecucion remota por cualquier mensaje normal. Candidato homolog conserva proxy-addr/tar; no se desplego una version no estable como arreglo supuesto.

Criticas n8n actual y candidato: @simple-git/argv-parser 1.1.1 (CVE-2026-102829, fix 2.0.1), simple-git 3.36.0 (CVE-2026-102828, fix 4.0.1), handlebars 4.7.9 (CVE-2026-106445 y CVE-2026-106446, fix 4.7.10). La actualizacion oficial por si sola no elimina esas coincidencias. Fuente del contenedor actual usa FROM n8nio/n8n:latest y USER root; pendiente sustituirla por build controlado sin root tras respaldo/restauracion y pruebas de compatibilidad.

Fuentes primarias: [Baileys advisory](https://github.com/WhiskeySockets/Baileys/security/advisories/GHSA-qvv5-jq5g-4cgg), [protobuf advisory](https://github.com/advisories/GHSA-xq3m-2v4x-88gg), [n8n 2.44.6](https://github.com/n8n-io/n8n/releases/tag/n8n%402.44.6). Reportes completos privados en `.qa/evidence/*scan-20261023.json`. Pendientes de cierre: remediacion/triage de contenedores, limite de descarga upstream previo a acumular documentos, restauracion aislada comprobada y nueva aceptacion real tras actualizar infraestructura.

## Parche del runtime y acceso de auditoria 2026-10-23

521e985 desplegado y prueba real sin cobro repetida con exito: registro 201, una sola sesion durable, Stripe open confirmado, despues expirado y cuenta temporal retirada. No se cancelaron planes existentes. Se retiraron scanner/inventario temporales del contenedor y se revoco la clave SSH de auditoria; Railway confirma cero claves registradas y ambos archivos locales de la clave fueron eliminados.

La restriccion 24.x resolvio Node 24.21.0 en Railway. El [indice oficial de Node](https://nodejs.org/dist/index.json) indica 24.22.1, 2026-10-20, security=true y LTS Krypton. Se fija 24.22.1 en package.json/lock y se agrega una regresion que impide versiones anteriores o rangos ambiguos. Binario de prueba descargado del origen oficial y verificado con SHASUMS256; 146 unitarias y 24 E2E aprobadas usando esa misma revision. Falta confirmar la version resuelta despues de desplegar este ultimo commit.

El usuario descarto consumo adicional en Railway y eligio un laboratorio local gratuito. WSL 2.6.3 esta instalado sin distribuciones; Docker/PostgreSQL no tienen ejecutables utilizables en las rutas revisadas. Preparacion local en curso, sin servicios cloud adicionales ni cambios de imagen en produccion.

## Verificacion del parche y regresion CORS de Evolution 2026-10-23

9f45a5b desplegado SUCCESS. Metadata efectiva Railway: Node solicitado/resuelto 24.22.1. Auditoria npm actual con esa revision: cero vulnerabilidades reportadas para la aplicacion; no cubre n8n/Evolution. Laboratorio gratuito instalado: Ubuntu24.04.5 en WSL, Docker Engine29.1.3 y Compose2.40.3. No hay servicios cloud adicionales. Imagen homolog inspeccionada localmente sin red, credenciales ni volumenes: app2.4.0, Node24.18.0, Baileysrc13. No se promueve a produccion: 2.4 incorpora activacion de licencia segun release oficial y requiere evaluacion aparte.

La comprobacion anterior de CORS cubria navegadores, pero omitio llamadas sin Origin de n8n. Nueva regresion real: GET autenticado a connectionState sin Origin devuelve500; misma solicitud con Origin del manager devuelve200 y state=open. El codigo oficial src/main.ts de Evolution2.3.7 rechaza undefined cuando ORIGIN no contiene wildcard. Esto explica el502 del webhook de estado del panel; no implica desconexion de la instancia.

Correccion preparada: Origin fijo del manager en los15 nodos HTTP de Evolution, conservando apikey, URLs, cuerpos, timeouts y guardas de tenant. No cambia CORS del proveedor ni envia ese header a Supabase/Upload-Post. Generador idempotente y regresion aprobados;147 unitarias pasan. Revision independiente sin hallazgos importantes. Borrador exportado(26) cotejado con respaldo(25):210 nodos, mismas conexiones/settings/credenciales y parametros salvo los15 headers; IDs/posiciones son normalizados por el importador. Pendiente confirmar publicacion y HTTP200 del webhook del panel. Nunca publicar un borrador con nodos duplicados.

Aceptacion completada: version «CORS Evolution: origen permitido - 2026-10-23» publicada, UI Published. Webhook del panel HTTP200/conectado=true. Usuario envio «Hola, prueba CORS VeloDrive» y confirmo respuesta. Lectura acotada al lote QA verifica ejecucion21427:1 inbox completed,1 mensaje de usuario,1 respuesta del agente, outbound aceptado y0 incidentes. La importacion inicial duplico nodos solo en borrador; se reemplazo antes de publicar y export26 confirmo exactamente210 nodos. No se activo la version duplicada.

## Avance verificado 2026-10-24

La candidata **local, no desplegada** de Evolution conserva2.3.7 y actualiza las
dependencias descritas en infra/security-lab/evolution/README.md. Imagen final
aad522c1e4dd:0 coincidencias CRITICAL y69 HIGH. Sigue pendiente evaluar los altos,
probar compatibilidad completa y respaldar Evolution antes de promover. La imagen
productiva y los cuatro hallazgos criticos de n8n no se declaran corregidos.

**Alto, conexion de n8n a Postgres:** DB_POSTGRESDB_HOST apunta al proxy publico y
DB_POSTGRESDB_SSL_ENABLED no esta activo. Riesgo de exposicion del trafico y
credenciales fuera de la red privada. No es evidencia de interceptacion ocurrida.
Correccion pendiente: DB_POSTGRESDB_HOST=postgres.railway.internal y
DB_POSTGRESDB_PORT=5432, conservando base/usuario/password actuales, desplegando
una imagen controlada compatible y verificando la conexion efectiva. No reiniciar
ni reconstruir ciegamente el Dockerfile actual con FROM latest. Para transportes
publicos exigir TLS verificado, no rejectUnauthorized=false ni sslmode=require
como sustituto de validar la identidad.

Se creo un respaldo consistente pg_dump por TLS verificado contra la CA y huella
obtenidas del control autenticado de Railway. Volcado cifrado AES256GCM, clave y
clave de n8n protegidas con DPAPI CurrentUser, sin volcado plano guardado. La copia
se restauro en Postgres16.15 local, red Docker interna y sin puertos publicados:
16 workflows,0 activos,5 credenciales,204 ejecuciones. Verificacion de descifrado
en memoria5/5; no se exportaron credenciales en claro. La copia se retiro al cerrar.
Reportes privados n8n-isolated-restore-20261024.json y evolution-locked-candidate-scan-20261024.json.

**Limites de recuperacion:** esta prueba cubre la base n8n, no Supabase ni sesiones
Evolution. DPAPI depende de conservar el perfil Windows del usuario; falta una
copia de recuperacion con custodia independiente antes de considerarlo un plan
de desastre completo. El respaldo no cambia por si mismo la conexion productiva.
La clave SSH temporal fue revocada y Railway confirma cero claves registradas.

## Descarga documental acotada: lista local, publicacion pendiente

Nuevo document-download.js usa el limite decoded maxResponseBodyBytes del helper
HTTP de n8n antes de acumular el JSON:4*ceil(10MiB/3)+64KiB. El limite posterior de
archivo sigue siendo10MiB y conserva validacion de MIME/base64/firma. No sigue
redirecciones; destino y Origin fijos; identidad de lote revalidada y errores
del proveedor sustituidos por codigo seguro. Si falla, el combinador conserva el
paso y pide reenviar el archivo sin incluir mensajes internos.

156 pruebas unitarias aprobadas, incluida regeneracion idempotente y memoria
persistente. Prueba local real en n8n2.44.6: limite efectivo para respuestas
fragmentadas y sobre bytes descomprimidos gzip. Fuente de n8n2.44.4 declara
maxResponseBodyBytes en IHttpRequestOptions. Complejidad de descarga O(B) tiempo
y O(min(B,L)) memoria del transporte, con L acotado al limite de JSON; validacion
posterior O(L). No se afirma memoria constante independiente del limite.

Parche live derivado del export27: solo2 nodos de210 cambian, mismas conexiones,
ajustes y credenciales. **Pendiente publicar:** importacion interrumpida; revision
automatica sin cuota bloqueo reabrir pestaña. El borrador fue vaciado para evitar
duplicados al importar, pero no se publico. Restaurar desde
.qa/main-bounded-media-live.json, exportar y comparar antes de publicar. No usar
el JSON completo del repositorio como sustituto del export live. La version
anterior publicada no fue desactivada ni reemplazada por el borrador vacio.

Actualizacion09:05 del2026-10-24: bloqueo de importacion resuelto. Export28 tiene
210 nodos y coincide con el parche revisado en parametros, credenciales,
conexiones y ajustes. Version «Descarga documental acotada - 2026-10-24» publicada;
UI Published y consulta READ ONLY con TLS confirman active=true, draftNodes=210,
publishedNodes=210 y boundedDownloaderPublished=true. La copia vacia nunca se
publico. Evidencia visual n8n-bounded-documents-published-20261024.png y reporte
live-workflow-publication-20261024.json privados. Sigue pendiente una nueva
aceptacion documental real; no confundir la comprobacion de version con esa prueba.

## Estado consolidado del 25 de octubre de 2026

Esta seccion actualiza los pendientes historicos anteriores; no elimina su evidencia.

| Area | Evidencia / estado actual | Pendiente para cierre |
|---|---|---|
| Control de utilidad | Commit70f83ae desplegado SUCCESS; HTML/JS/vehicle-finance.js publicos coinciden con Git. Costos incompletos no producen utilidad ficticia; venta confirmada, centavos enteros, fechas civiles y gastos con error visibles. | Aceptacion operativa del propietario; no equivale a contabilidad fiscal ni consignacion. |
| n8n | Oficial2.44.6 UID1000, Postgres privado y restauracion aislada comprobada; WhatsApp y alerta de soporte confirmados por usuario. | Remediar dependencias criticas/altas; no se declaran resueltas por usar la imagen oficial. |
| Evolution | Candidata local con compatibilidad y migraciones probadas. Produccion conserva imagen anterior. | Promover artefacto revisado, evitar sesiones simultaneas y repetir aceptacion real. |
| Recuperacion | Cinco respaldos cifrados verificados en USB independiente del perfil Windows. Postgres Evolution17.11 y Redis restaurados aisladamente. | Supabase completo, checkpoint coordinado PG/Redis, automatizacion/retencion y RPO/RTO medidos. |
| SSH temporal | Acceso revocado y archivos de clave retirados despues de respaldar. | Crear otra clave temporal solo si un siguiente cambio la requiere; revocarla al terminar. |

La base de Trivy usada inicialmente estaba fechada23Oct. Tras actualizarla a
25Oct19:10UTC, la misma candidata Evolution25Oct muestra0CRITICAL/5HIGH:
body-parser1.20.3, multer2.3.0, Undici6.29.0/7.29.1 y Zod3.25.76.
El informe anterior0/0 es historico, no un cierre vigente. Se preparan parches
compatibles1.20.9,2.5.0,6.29.1/7.30.1. Zod requiere evaluar consumidores antes
de migrar de3a4; no se impone un override mayor para silenciar el escaner.

Quinta ronda local `qa-20261025b` construida y probada:0CRITICAL/2HIGH.
Quedan Undici6.29.0 dentro de npm y Zod3.25.76. La regla Undici6 en el lock de
Evolution no cambia el npm global; no declararla correccion efectiva de ese aviso.
Smoke de compatibilidad aprobado;57 migraciones y autenticacion401/401/200.

La misma auditoria encontro body-parser en la aplicacion. Se actualizo el lock a
1.20.9: npm audit de produccion reporta0avisos. Prueba HTTP real con gzip valido e
invalido mantiene la disponibilidad;181unitarias y34E2E aprobadas. Esto no es una
prueba exhaustiva de todas las variantes del exploit. Commitbe80aaf desplegado:
Railway55432fe4-fffa-4b49-b184-0e27c3ef76c3 SUCCESS, commitHash coincide y
health publico200. La aplicacion tiene el parche; no implica actualizar Evolution/n8n.

Fuentes: [body-parser](https://github.com/expressjs/body-parser/security/advisories/GHSA-27r3-jxmh-p828),
[Multer](https://github.com/expressjs/multer/security/advisories/GHSA-q7qp-rjg7-q26m),
[Undici](https://github.com/nodejs/undici/security/advisories/GHSA-xjj6-f33q-929c),
[comportamiento de arrays Zod](https://github.com/colinhacks/zod/issues/1872).
Procedimiento de custodia y limites: [recuperacion portable](recovery-package.md).

No se aprueba aun una distribucion comercial general basandose solo en estas
pruebas. Falta cerrar infraestructura, recuperacion completa y capacidad concurrente.
