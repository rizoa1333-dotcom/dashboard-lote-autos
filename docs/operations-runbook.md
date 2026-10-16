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
node tests/integration/tenant-isolation.mjs --live-qa
node tests/integration/whatsapp-reliability.mjs --live-qa
node tests/integration/incident-notifications.mjs --live-qa
node tests/integration/whatsapp-webhook.mjs --live-qa
```

El replay de una conversación real requiere el ID del mensaje QA reciente y verifica que su contenido sea la frase de prueba autorizada. No usar mensajes de clientes.

## Recuperación

Conservar la misma `N8N_ENCRYPTION_KEY`, volumen `/home/node/.n8n` y `N8N_USER_FOLDER=/home/node`. Cambiar la clave sin migrar credenciales impide descifrarlas.

El respaldo del 15/10/2026 está fuera de Git, protegido con ACL y DPAPI del usuario Windows en `C:\Users\bafar\.railway\velodrive-recovery-2026-10-15`. Incluye PostgreSQL, configuración, workflows y credenciales cifradas. DPAPI requiere ese perfil Windows; guardar una recuperación portable en un gestor seguro es una tarea pendiente. No copiar estas claves al repositorio.

Se probó restauración SQL en una base aislada sin conectar n8n a ella; no se activaron flujos restaurados. Una prueba integral debe restaurar base, clave y archivos en un servicio aislado, con todos los triggers y envíos externos deshabilitados, comprobar credenciales y medir RTO.

## Pendientes operativos

- Copias recurrentes externas, retención y prueba integral de recuperación; todavía no hay RPO/RTO contractual medido.
- Monitor externo a n8n: su propio Error Trigger no avisa si todo n8n está caído.
- Resolución manual de un envío incierto. El circuito automático Error Trigger -> incidente -> correo se probó con la ejecución QA `16257`, aceptada por Resend el 15/10/2026; el flujo temporal quedó archivado.
- Revisar compatibilidad PostgreSQL 16 con n8n 2.43.6 antes de actualizarlo. No actualizar la base productiva sin otro respaldo/restauración.
