# Estado de remediacion de seguridad - VeloDrive

Fecha: 2026-10-20. Rama: fix/security-20261019. Este documento complementa la auditoria del 18-10; no equivale a una certificacion de ausencia de vulnerabilidades.

## Evidencia actual

- 118/118 pruebas unitarias y 22/22 pruebas Playwright aprobadas. Servicios externos simulados en E2E; no se ejecutaron cargos.
- npm audit --omit=dev: cero vulnerabilidades. No cubre imagenes de n8n/Evolution sin SBOM.
- Produccion: seis comprobaciones de autenticacion aprobadas; canal WhatsApp conectado despues del reinicio.
- App c3230c6 desplegada; n8n publicado con 210 nodos y autenticacion separada. Migraciones de facturacion, tenants y trigger de citas aplicadas.

## Hallazgos

| ID | Estado | Evidencia o condicion pendiente |
|---|---|---|
| C01 | Corregido en app | proxy-addr 2.0.8; audit limpio; imagenes externas fuera de alcance |
| H01 | Corregido en flujo actual | Stripe Trigger de n8n desactivado y desconectado; backend es escritor del flujo actual; dos destinos antiguos deshabilitados. Destino restante 7c40 identificado por el usuario como prueba de VeloDrive y deshabilitado; solo el destino actual queda activo |
| H02 | Corregido en rutas actuales | Firma/referencia/precio validados; reconciliacion contra estado actual con claim y commit fenced en DB. No probado mediante un nuevo cobro real |
| H03 | Corregido en canales principales | Secretos separados de citas y Evolution; headers verificados antes de procesar; query secret retirada y variable compartida eliminada. Trigger opaco notificacion_auto_nuevo requiere inventario |
| H04 | Corregido y verificado | Usuario revoco default secreta; comprobacion directa: clave anterior HTTP 401, nueva HTTP 200; WhatsApp sigue conectado. Workflow legado despublicado y saneado |
| H05 | Corregido en rutas identificadas | 15 politicas restrictivas de plan para escritura y gates premium en automatizaciones. QR exige plan activo; cualquier onboarding alternativo debe mantener politica explicita |
| H06 | Corregido | Herramientas de agente usan agent_inventory, proyeccion sin costos privados y filtro de lote |
| M01 | Parcial | Flujo principal no guarda ejecuciones completas; revisar auxiliares y retencion historica antes de dar por eliminado el riesgo |
| M02 | Corregido | Revocados TRUNCATE/TRIGGER/REFERENCES de clientes y privilegios por columna |
| M03 | Corregido | chat_history modificable solo por servidor; cliente conserva lectura autorizada |
| M04 | Corregido | Restriccion de rol admite user/model/human |
| M05 | Parcial | Contrato REST y duplicados corregidos y probados; compensacion sigue siendo saga, sin recuperacion durable de huerfanos |
| M06 | Corregido y probado localmente | AbortController y generaciones invalidan respuestas; salida/cambio de usuario destruye datos y documento; pruebas de logout y cambio Auth. Despliegue del panel pendiente |
| M07 | Corregido y probado localmente | Catalogo consulta solo columnas comerciales, sin CRM/gastos; respuesta anterior no repuebla costos. Sigue siendo presentacion del propietario, no acceso publico. Despliegue pendiente |
| M08 | Parcial, publicado | Limite 10 MiB, base64 canonico, firma de formato y validacion posterior a descarga; buffer fuera de JSON. No incluye antivirus ni limite de streaming de la respuesta HTTP de Evolution |
| M09 | Corregido y probado localmente | CSP bloquea scripts inline/eval; SDK Supabase 2.118.0 local con integridad verificada; Tailwind compilado localmente. 3 regresiones HTTP reales prueban CSP, wizard, PDF y movil. Despliegue pendiente; estilos inline heredados aun permitidos |
| M10 | Parcial, probado localmente | API interactiva conserva limite; health y Stripe quedan fuera del cupo. Pruebas de 305 health y 301 API. Falta despliegue y almacenamiento compartido/concurrencia n8n |
| M11 | Pendiente | Restringir CORS de Evolution y credenciales a origenes necesarios |
| M12 | Corregido en produccion | FK compuesta validada; cero incoherencias previas. Prueba service_role RED antes y GREEN despues, con ROLLBACK: rechaza insercion cruzada/reasignacion y conserva cascada original |
| L01 | Corregido en funciones identificadas | search_path fijo y permisos de ejecucion restringidos; trigger de citas usa Vault |
| L02 | Pendiente | Fijar digests y escanear imagenes de n8n/Evolution |

## Riesgos residuales que impiden afirmar cierre total

1. Rotacion cerrada: anterior HTTP 401 y nueva HTTP 200; mantener inventario de consumidores para siguientes rotaciones.
2. Destinos Stripe antiguos deshabilitados por autorizacion expresa del propietario; solo servidor actual recibe eventos.
3. Payment Links reutilizables: dos compras abiertas antes de asociar la suscripcion aun pueden generar doble cobro. El bloqueo de cuenta vinculada reduce el riesgo pero no sustituye Checkout Sessions idempotentes.
4. notificacion_auto_nuevo requiere identificar consumidor, autenticacion y utilidad antes de retirarlo o corregirlo.
5. Cambios productivos desplegados por CLI aun no respaldados en GitHub: integrar esta rama antes del siguiente despliegue desde main.

## Orden siguiente

Revocar y verificar clave antigua; atribuir entradas heredadas; respaldar rama remota; cerrar M06/M07/M08 y luego configuracion de infraestructura y dependencias de contenedor. Mantener pruebas de aislamiento por operacion y pruebas reales sin documentos personales.

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
