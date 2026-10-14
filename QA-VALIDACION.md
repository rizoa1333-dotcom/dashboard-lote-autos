# Validación QA de VeloDrive

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

Revisé el archivo `VeloDrive-n8n-intervencion-automatica.json` disponible en el proyecto. El export está marcado `active: false`. La ruta principal sí está conectada: `Webhook WhatsApp1` → `Secret Evolution Válido1` → `Filtro Anti-Bucle (fromMe)1` → `Get many rows1` → asociación de canal/lote → agente. El `AI Agent Vendedor1` tiene una salida de error conectada a `responder error IA1`, que responde al contacto; no hay un nodo que notifique al dueño.

Hallazgo concreto: el nodo llamado `Filtro Anti-Bucle (fromMe)1` solo comparaba `body.event == "messages.upsert"`; podía dejar pasar mensajes originados por la propia instancia y generar bucles. Ya actualicé el JSON del flujo para exigir además `body.data.key.fromMe === false`. La salida false simplemente ignora otros eventos. El filtro de canales consulta `whatsapp_channels.instance_name`, así que el valor de `body.instance` debe coincidir con el nombre guardado en esa tabla.

### Checklist para localizar por qué no inicia una ejecución

1. En n8n, confirma que el workflow está **activo** y copia la **Production URL**, no la Test URL. El webhook exportado es `POST /webhook/whatsapp-lotes`.
2. En Evolution API, habilita el webhook global o de la instancia y configura la URL pública de producción de n8n, por ejemplo `https://<tu-n8n>/webhook/whatsapp-lotes?secret=<secreto-compartido>`.
3. Suscribe el evento entrante `MESSAGES_UPSERT`/`messages.upsert` según cómo lo muestra tu versión de Evolution. El IF actual compara exactamente el texto en minúsculas `messages.upsert`; verifica el valor real en el payload recibido.
4. En n8n → Executions, envía un mensaje desde otro teléfono. **Si no aparece ejecución**, el problema ocurre antes del primer nodo: URL, workflow inactivo, conectividad, método HTTP o webhook configurado en otra instancia.
5. Si aparece y se detiene en `Secret Evolution Válido1`, verifica que la query `secret` coincida con `WEBHOOK_SECRET` del servicio n8n. No compartas ese secreto en capturas o mensajes.
6. Si pasa el secreto pero no llega a consultar datos, revisa evento/cuerpo en `Filtro Anti-Bucle (fromMe)1`.
7. Si llega a `Get many rows1`, confirma que la fila de `whatsapp_channels` tiene el nombre exacto de la instancia, el `lote_id` correcto y una conexión Supabase válida en n8n.
8. Si el agente corre pero no responde, abre el detalle de la ejecución y revisa credenciales/modelo Gemini, herramientas del agente y los nodos de envío a Evolution (URL de instancia, API key y número destino).

### Aviso al dueño cuando falla el agente

Crear un **workflow separado** en n8n para manejar fallos de ejecución:

1. Añadir **Error Trigger** como primer nodo.
2. Añadir un nodo **Edit Fields** para formar un resumen con nombre del workflow, nodo que falló, mensaje de error, timestamp y `execution.url`. No incluir API keys ni el payload íntegro del prospecto.
3. Añadir **Send Email** usando SMTP y las credenciales del correo de soporte/dueño. Destinatario: correo del dueño del lote. Para elegir destinatario por lote, el flujo principal debe enviar el `lote_id`/correo del dueño a una tabla de incidentes o a un webhook de errores; el Error Trigger por sí solo no conoce de forma fiable la fila que el agente estaba procesando.
4. En el workflow principal, abrir Settings y seleccionar este workflow en **Error Workflow**. Activarlo y probar con una ejecución controlada que falle.

El archivo exportado actual ya responde al cliente por la salida de error del agente. El Error Trigger agrega una alerta operativa independiente; no sustituye la respuesta manual ni recupera ejecuciones por sí solo.

## 3. Pruebas agregadas

Los tests usan servicios Supabase/Evolution simulados. No escriben en producción ni confirman que Railway, n8n, Evolution, Stripe o Gemini estén operativos.

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
