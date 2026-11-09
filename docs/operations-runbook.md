# Operación de VeloDrive

## Mensajes y errores

`whatsapp_inbox` tiene una clave única por instancia e ID. Las búsquedas/reclamaciones usan índices: costo esperado O(log n), con O(1) estado por mensaje. La memoria crece O(n) con los eventos conservados; definir retención antes de escalar.

| Estado | Acción |
| --- | --- |
| processing | La ejecución propietaria procesa la entrada. |
| sending | Ya autorizó un intento; no crear otro. |
| accepted | Evolution devolvió un ID; aún no prueba entrega al teléfono. |
| completed | Terminó el procesamiento. |
| failed | Falló antes de autorizar envío; revisar el incidente. |
| uncertain | Puede haberse enviado: verificar en Evolution y con el destinatario antes de intervenir. |

Las reentregas no vuelven a adquirir registros existentes. No restablecer estados ni borrar eventos para reintentar sin comprobar la entrega. El proveedor externo no participa en la transacción SQL: se prioriza evitar respuestas duplicadas, con revisión humana para resultados inciertos.

El Error Workflow registra fallos automáticos. La revisión programada procesa hasta 100 eventos antiguos por ejecución. El despachador consulta hasta 20 avisos por ejecución; una reclamación por ID autoriza un emisor. Resend usa HTTPS y una clave de idempotencia estable. `notification_state=sent` indica aceptación del proveedor; entrega final se verifica en Resend o con el destinatario. Si la ejecución muere tras reclamar, revisar también avisos en `sending`.

Credencial HTTP: permiso de envío en Resend y dominio permitido `api.resend.com`. El emisor inicial `onboarding@resend.dev` solo permite el destinatario propietario de la cuenta. Para otros destinatarios o marca propia, verificar un dominio y definir `ALERT_FROM_EMAIL`. No usar Gmail SMTP en Railway Hobby.

## Pruebas

```powershell
npm test
npm run test:e2e
node tests/integration/tenant-isolation.mjs --live-qa --qa-config RUTA-PRIVADA-QA.json
node tests/integration/whatsapp-reliability.mjs --live-qa
node tests/integration/incident-notifications.mjs --live-qa
node tests/integration/whatsapp-webhook.mjs --live-qa
```

El replay de una conversación real requiere el ID del mensaje QA reciente y verifica que su contenido sea la frase de prueba autorizada. No usar mensajes de clientes.

La prueba de aislamiento con sesiones de Auth requiere un proyecto Supabase de QA
con los disparadores externos desconectados. El JSON privado contiene
`SUPABASE_URL`, `SUPABASE_ANON_KEY` y `SUPABASE_SERVICE_ROLE_KEY` de ese proyecto.
La prueba rechaza el host configurado en el panel y crea dos lotes sintéticos
activos para comprobar las escrituras cruzadas sin que un plan inactivo las oculte.

## Correcciones de aislamiento y marketing del 9 de noviembre

`supabase_tenant_policy_baseline.sql` conserva en Git las políticas de lote y
Storage que antes se obtenían del inventario del proyecto. Requiere el esquema
base restaurado, las migraciones de permisos y el bucket privado `documentos-leads`.
El laboratorio usa esta migración y comprueba el aislamiento con diez lotes.

Para desplegar marketing, primero aplicar `supabase_marketing_security.sql`,
verificar los permisos de sus funciones y luego importar el JSON del workflow.
Conservar el flujo anterior para reversión y revisar los envíos pendientes
anteriores al corte. El cambio pasa los tokens a cuerpos POST y conserva la
rotación con comparación del valor anterior. Los cuerpos siguen siendo sensibles.
Mantener apagado el guardado de datos de ejecución y revisar la configuración
de registros del despliegue.

La reclamación persistente usa lote, auto, plataformas, fotos en su orden y texto.
Procesar el contenido cuesta `O(B)` para `B` bytes y el índice mantiene una fila
por contenido distinto. La misma carga reutiliza el identificador mientras
el resultado sea aceptado o incierto. Una respuesta de rechazo HTTP prevista
permite otro intento. Si la red falla o el proveedor devuelve un resultado
ambiguo, consultar el estado con el identificador registrado antes de intervenir.
Una unidad con un intento pendiente espera confirmación antes de aceptar otro
contenido. Verificar Meta confirma ese intento cuando el proveedor devuelve el
mismo identificador y un estado conocido.
La aceptación de la solicitud todavía requiere verificar el resultado por red.

## Recuperación

Conservar la misma `N8N_ENCRYPTION_KEY`, volumen `/home/node/.n8n` y `N8N_USER_FOLDER=/home/node`. Cambiar la clave sin migrar credenciales impide descifrarlas.

El respaldo del 15/10/2026 está fuera de Git, protegido con ACL y DPAPI del usuario Windows en `C:\Users\bafar\.railway\velodrive-recovery-2026-10-15`. Incluye PostgreSQL, configuración, workflows y credenciales cifradas. DPAPI requiere ese perfil Windows; guardar una recuperación portable en un gestor seguro es una tarea pendiente. No copiar estas claves al repositorio.

Se probó restauración SQL en una base aislada sin conectar n8n a ella; no se activaron flujos restaurados. Una prueba integral debe restaurar base, clave y archivos en un servicio aislado, con todos los triggers y envíos externos deshabilitados, comprobar credenciales y medir RTO.

## Pendientes operativos

- Copias recurrentes externas, retención y prueba integral de recuperación; todavía no hay RPO/RTO contractual medido.
- Monitor externo a n8n: su propio Error Trigger no avisa si todo n8n está caído.
- Resolución manual de un envío incierto. El circuito automático Error Trigger -> incidente -> correo se probó con la ejecución QA `16257`, aceptada por Resend el 15/10/2026; el flujo temporal quedó archivado.
- Revisar compatibilidad PostgreSQL 16 con n8n 2.43.6 antes de actualizarlo. No actualizar la base productiva sin otro respaldo/restauración.
