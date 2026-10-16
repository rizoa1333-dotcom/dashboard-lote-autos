# Validación QA de VeloDrive

## Corrección de citas y documentos — 16 de octubre de 2026

- Causa comprobada en ejecución `16996`: `leads.id` es numérico (lead QA `18`), pero el nodo documental lo validaba como UUID. Se acepta un entero positivo compatible con bigint y se comprueba el UUID del lote contra el tenant autenticado.
- La confirmación de una cita nueva incluye la primera solicitud de identificación en el mismo mensaje. Una cita previa no reinicia la solicitud. Completar documentos no vuelve a prometer crear la cita que ya existe.
- La escritura de documentos filtra por lead y lote. Las respuestas documentales pasan por autorización atómica, aceptación y cierre del mensaje durable.
- En el primer despliegue de esta corrección, `17004` fue rechazado por Evolution porque se eliminó el prefijo internacional. Se corrigió conservando el destinatario del JID y agregando una regresión explícita. Ese intento no se reenvía automáticamente.
- Versión final publicada con 197 nodos y el mismo Error Workflow. Exportada y comparada con el archivo local: parámetros de documentación, fusión, actualización, respuesta y cierre coinciden.
- Prueba real `17006`: respuesta aceptada con ID saliente y estado `completed`; recepción confirmada por el usuario. Se conserva una sola cita QA para el 17/10/2026 a las 17:00.
- Adjunto sintético enviado por WhatsApp: `17009` guardó la imagen de prueba en el bucket privado y avanzó al paso 2; acceso autorizado al objeto devuelve 200. `17010` guardó el segundo documento y avanzó al paso 3. Ambas respuestas quedaron `completed` con ID saliente. El usuario no envió documentos personales para estas pruebas.
- Cierre real `17013`: paso 4, estado `Documentación Completa`, respuesta `completed` con ID saliente. Los tres archivos devuelven 200 con autorización y 400 en la ruta pública sin credenciales. Sigue existiendo una sola cita. El usuario confirmó el recorrido por teléfono.
- Pruebas de regresión: ID numérico, aislamiento de lote, prefijo internacional, imagen, PDF sin base64, paso inválido, solicitud inicial, cita previa y conexiones durables. Los generadores conservan esta corrección al ejecutarse repetidamente.
- Suite final del 16/10/2026: 70 pruebas unitarias y 14 pruebas de navegador aprobadas. Las pruebas de adjuntos con datos simulados no sustituyen la entrega real por WhatsApp y Storage.

El análisis documental por mensaje usa memoria proporcional al adjunto O(b); validación de identidad y paso O(1). No equivale a validar autenticidad de documentos ni aprobación crediticia.

## Estado comprobado — 15 de octubre de 2026

- Flujo principal publicado: 191 nodos, reclamación durable por `(instance_name,message_id)`, ACK después de persistir y autorización atómica antes del envío. La rotación mensual sigue activa.
- Manejador de incidentes publicado y asociado al principal: `RWgTd6Jx8snoluJc`. Registra referencias saneadas y revisa mensajes atascados cada cinco minutos.
- Alertas HTTPS publicadas: `M74TiQsnq4FpEEg8`, Resend con permiso de envío y credencial limitada a `api.resend.com`. Recepción del correo QA confirmada por el usuario. SMTP no se usa: Railway Hobby lo bloquea.
- n8n conserva su clave vigente y configuración en el volumen `/home/node/.n8n`. Reinicio comprobado; las tres credenciales se descifraron correctamente. Acceso SSH temporal revocado.
- Respaldo PostgreSQL restaurado en una base aislada: 11 flujos y tres credenciales cifradas. Falta automatizar copias y probar recuperación integral de la aplicación.
- 62 pruebas unitarias aprobadas; 14 pruebas Playwright aprobadas el mismo día. Las E2E usan servicios simulados.
- 22 comprobaciones reales de aislamiento: dos usuarios efímeros, citas, documentos privados, cambios de plan/claves y escrituras ajenas. Fixtures eliminados.
- RPC reales: ocho reclamaciones concurrentes producen un propietario y ocho autorizaciones producen un intento de envío; comprobados fallos previos, resultados inciertos y permisos.
- Webhook real: cinco entregas de un eco QA produjeron un registro y ningún envío. Mensaje nuevo «prueba final velodrive»: una entrada, una respuesta y estado `completed`; recepción confirmada. Repetición de ese ID cinco veces conservó ejecución e historial originales.

- Error Trigger automático comprobado: la ejecución QA `16257` generó el incidente `DEPENDENCY_TIMEOUT`; el despachador programado lo cerró como `sent` a las 16:10:57 (Colima). El flujo temporal `7RPj2584NmSxrn6L` quedó archivado. La aceptación de esta segunda alerta por Resend está comprobada; la recepción de la primera alerta fue confirmada por el usuario.

Límites: falta un monitor externo a n8n, respaldos recurrentes, prueba integral de recuperación y ejercicio operativo de resolución manual de un envío incierto. El respaldo actual depende de DPAPI del usuario Windows; requiere custodia portable adicional. Estos controles no prometen ausencia de fallos ni entrega exactamente una vez.

## 1. Registro y rollback compensatorio

El navegador ahora envía el formulario a `POST /api/register-lote`. El servidor crea la cuenta de Supabase Auth, inserta el lote con `email_admin` y, si falla la inserción, elimina el lote parcial y la cuenta Auth recién creada. La llave `SUPABASE_SERVICE_ROLE_KEY` solo se usa en el servidor.

Auth y PostgREST son servicios separados: no comparten una transacción SQL. El endpoint hace una compensación explícita, no promete atomicidad distribuida. Si Supabase no confirma la limpieza, la respuesta incluye `rollbackOk: false` o `cleanupOk: false` y pide contactar soporte antes de reintentar. En un corte de red justo después de que Auth crea al usuario pero antes de que el servidor reciba su ID, ningún endpoint puede garantizar que conozca qué cuenta limpiar; revisar los logs del servidor si ocurre.

Si falta la columna que causó el error reportado, ejecutar en Supabase SQL Editor:

```sql
ALTER TABLE public.lotes
  ADD COLUMN IF NOT EXISTS email_admin text;
```

La migración guardada en `supabase_registration_schema.sql` es idempotente y conserva los registros existentes.

### Variables del servicio web en Railway

Configurar en el servicio de VeloDrive, no en n8n ni en el navegador:

| Variable | Valor |
| --- | --- |
| `SUPABASE_URL` | URL del proyecto Supabase |
| `SUPABASE_ANON_KEY` | anon/publishable key del proyecto (el backend la usa para signup) |
| `SUPABASE_SERVICE_ROLE_KEY` | service_role/secret key; mantener privada y solo en Railway |
| `APP_BASE_URL` | URL HTTPS pública de VeloDrive, por ejemplo `https://velodrive.up.railway.app` |

También registrar `APP_BASE_URL` en Supabase Auth → URL Configuration → Redirect URLs. No agregar la service role key a `.env` versionado, `dashboard.js`, `dashboard.html` ni al flujo n8n.

## 2. Diagnóstico del flujo de Evolution API/n8n

El export local está marcado `active: false` para evitar activar copias accidentalmente; producción está publicada. El flujo valida secreto, identidad del evento y canal exacto; reclama el mensaje en PostgreSQL y después confirma recepción. Solo la ejecución que obtuvo la reclamación continúa hacia el agente o la intervención humana.

`Preparar identidad del mensaje` exige ID, instancia y `fromMe` booleano. Acepta mensajes propios para distinguir intervención humana de ecos de la API; los ecos no activan IA. Los IDs salientes registrados también se descartan por la reclamación durable. El nombre de instancia debe coincidir exactamente con `whatsapp_channels.instance_name`.

### Checklist para localizar por qué no inicia una ejecución

1. En n8n, confirma que el workflow está **activo** y copia la **Production URL**, no la Test URL. El webhook exportado es `POST /webhook/whatsapp-lotes`.
2. En Evolution API, habilita el webhook global o de la instancia y configura la URL pública de producción de n8n, por ejemplo `https://<tu-n8n>/webhook/whatsapp-lotes?secret=<secreto-compartido>`.
3. Suscribe `MESSAGES_UPSERT`; el controlador normaliza el nombre del evento a `messages.upsert`. Verifica el payload real y el ID del mensaje.
4. En n8n → Executions, envía un mensaje desde otro teléfono. **Si no aparece ejecución**, el problema ocurre antes del primer nodo: URL, workflow inactivo, conectividad, método HTTP o webhook configurado en otra instancia.
5. Si aparece y se detiene en `Secret Evolution Válido1`, verifica que la query `secret` coincida con `WEBHOOK_SECRET` del servicio n8n. No compartas ese secreto en capturas o mensajes.
6. Si pasa el secreto pero no llega a consultar datos, revisa evento/cuerpo en `Filtro Anti-Bucle (fromMe)1`.
7. Si llega a `Get many rows1`, confirma que la fila de `whatsapp_channels` tiene el nombre exacto de la instancia, el `lote_id` correcto y una conexión Supabase válida en n8n.
8. Si el agente corre pero no responde, abre el detalle de la ejecución y revisa credenciales/modelo Gemini, herramientas del agente y los nodos de envío a Evolution (URL de instancia, API key y número destino).

### Aviso al dueño cuando falla el agente

La implementación actual utiliza dos workflows separados:

1. `VeloDrive-n8n-incidentes.json`: Error Trigger → saneamiento → RPC de incidentes. Otra rama programada revisa ejecuciones atascadas. Está asociado en Settings → Error Workflow del principal.
2. `VeloDrive-n8n-alertas-correo.json`: consulta avisos pendientes → reclamación atómica → Resend HTTPS con Idempotency-Key → confirmación o resultado incierto.
3. Destinatario central autorizado: `rizoa1333@gmail.com`. Solo se envían código, nodo e identificadores; no conversaciones, documentos ni mensajes de error originales.
4. El correo de prueba llegó. El ejercicio completo de un fallo automático que dispare Error Trigger sigue pendiente; las ejecuciones manuales no disparan ese trigger.

El archivo exportado actual ya responde al cliente por la salida de error del agente. El Error Trigger agrega una alerta operativa independiente; no sustituye la respuesta manual ni recupera ejecuciones por sí solo.

## 3. Pruebas agregadas

`npm test` y Playwright usan dobles de servicios. Los scripts de `tests/integration/` requieren `--live-qa`, escriben fixtures explícitos en Supabase y los limpian; el replay exige un mensaje QA reciente ya respondido. No ejecutar pruebas reales sin revisar su alcance.

```powershell
npm test
npm run test:e2e
```

- Unitarias (`node:test`): falta `email_admin` con rollback, email duplicado, otros errores Auth, registro correcto y consentimiento; payload Evolution, asociación instancia→lote, filtros de mensajes y detección del filtro `fromMe` ausente; estados accesibles de doble envío, carga, éxito y error.
- E2E (Playwright sobre HTML/JS reales, Supabase y Stripe simulados): error 422 de registro, persistencia simulada y salida a Stripe, alta/edición/baja con doble clic, modo sin conexión y control de utilidad/gastos.
- Accesibilidad revisada en los casos: diálogo etiquetado, foco inicial/restauración, Escape, labels, `aria-busy`, `role=status` y `role=alert`.

Para validar integraciones reales después de desplegar, ejecutar una cuenta de prueba de Stripe y un mensaje controlado de WhatsApp; revisar en sus consolas que el evento llegue y que el registro quede asociado al lote correcto.


## Rotación mensual de tokens — 13 de octubre de 2026

La rotación se mantiene activa. La rama procesa cada lote por separado con UUID v4, y el PATCH compara el token anterior antes de reemplazarlo. Solo una actualización confirmada puede continuar hacia la notificación. El panel recupera el token mediante su sesión Supabase/RLS cuando un webhook responde 401, y reintenta una sola vez con el mismo cuerpo y request_id. No reintenta fallos de red ni respuestas 5xx.

Complejidad: O(n) en el trabajo mensual para n lotes; O(1) solicitudes adicionales por operación del panel (máximo una consulta de token y un reintento). El procesamiento de n8n conserva los n elementos durante la ejecución.

Orden de despliegue: primero dashboard.js y ui-feedback.js; después importar y publicar el JSON completo en n8n. Mantener activo Schedule Rotación Mensual Token1. No ejecutar manualmente el flujo completo para probar esta rama: contiene operaciones de cobro, mensajes y publicación.

Verificaciones locales: 39 pruebas unitarias y 11 pruebas de navegador. Los servicios externos del navegador están simulados; estos resultados no prueban una publicación real de Meta ni una conversación real de WhatsApp.

Puertas de salida antes de ofrecer el servicio completo:
1. Desplegar esta revisión y verificar una rotación controlada del lote QA sin cerrar su sesión.
2. Conectar Página de Facebook e Instagram del lote QA; publicar contenido aprobado y comprobar resultado en cada red.
3. Confirmar WhatsApp real: mensaje entrante, respuesta, registro del prospecto/cita, intervención humana y reanudación.
4. Confirmar ciclo de Stripe: pago, cancelación desde portal, renovación y pago fallido. Evitar CFDI duplicados por reentrega de invoice.paid.
5. Verificar límites del plan Upload-Post por lote, alertas de fallos y restauración de respaldo antes de ampliar clientes.


## Reparación WhatsApp — 14 de octubre de 2026

Causas verificadas en producción: webhook de Evolution ausente; clave de canal distinta de la real; credenciales Supabase/Gemini no descifrables en n8n; consulta de pausa vacía detenía la ejecución sin error. Se repararon webhook, clave y credenciales existentes sin desvincular la instancia.

El controlador QR ahora distingue inexistencia (404) de errores de acceso/servidor, reconecta una instancia existente, recupera su clave real, registra el canal antes de habilitar mensajes y confirma el webhook. Las consultas de estado no generan códigos. El panel bloquea solicitudes simultáneas, limita la espera a 45 s, oculta códigos antiguos y consulta la conexión cada 4 s mientras el código está visible. La vinculación desde el teléfono sigue siendo manual.

Validación local final: 50 pruebas unitarias, 14 de navegador. El flujo corregido se importó y publicó en producción; se verificaron HTTP 200 y conectado=true en consultas de estado y conexión de la instancia QA. La ausencia de pausas manuales debe emitir un elemento vacío para continuar; mantener alwaysOutputData en Consultar pausa de la conversación.

La vinculación realiza O(1) llamadas externas por lote. La espera en el panel es acotada (aproximadamente 11 consultas de estado por QR) y usa O(1) memoria. Revisar que N8N_ENCRYPTION_KEY y el volumen de n8n se conserven entre despliegues: reingresar credenciales no demuestra que esa persistencia esté resuelta.


Validación real de cierre (14 de octubre): ejecución 16198, usando el mensaje QA entrante existente, completó Gemini, envío Evolution y persistencia del historial. Evolution aceptó el mensaje 3EB026771D98CFBE5BB036; el usuario confirmó recepción en el teléfono destinatario. Esta prueba reutilizó la entrada real desde el editor; no equivale a una prueba nueva de entrega del webhook posterior al despliegue.

La integración detectó una expresión JSON con cierre prematuro de n8n en Configurar webhook WhatsApp. Se separaron las llaves internas y se agregó regresión. También se eliminó Guardar Mensaje Usuario1: el mensaje entrante ya se registra antes de la IA. Esto evita duplicación dentro de una ejecución; aún debe existir deduplicación por ID de Evolution para tolerar reentregas del mismo webhook. No se eliminaron filas históricas de la prueba.

El export final conserva 176 nodos, sus conexiones coinciden con la fuente y pinData está vacío. Se mantiene activa la rotación mensual. La persistencia de N8N_ENCRYPTION_KEY/volumen entre reinicios sigue siendo una comprobación operativa pendiente; no cambiar esa clave sin respaldar y migrar las credenciales.
