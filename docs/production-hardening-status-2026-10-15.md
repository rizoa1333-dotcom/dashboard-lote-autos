# Estado histórico al pausar: 15 de octubre de 2026

Este apartado conserva la pausa inicial y fue superado por la continuación autorizada del mismo día. El estado vigente está en `QA-VALIDACION.md` y `docs/operations-runbook.md`.

## Aplicado y comprobado

- Supabase: `supabase_tenant_hardening.sql` y `supabase_whatsapp_reliability.sql` aplicados.
- Aislamiento real: 16 comprobaciones con dos usuarios temporales; limpieza de fixtures confirmada.
- RPC WhatsApp: 8 reclamaciones concurrentes producen un propietario; 8 autorizaciones producen un intento de envío. Comprobados fencing, duplicados, eco saliente, fallo previo al envío y resultado incierto posterior.
- Suite local: 58 pruebas unitarias y 14 pruebas Playwright aprobadas.
- n8n: configuración real encontrada en `/root/.n8n`, fuera del volumen. Copiada a `/home/node/.n8n`; fijadas `N8N_USER_FOLDER=/home/node` y la misma `N8N_ENCRYPTION_KEY`, sin reemplazarla.
- Railway: despliegue `17f120b9-84d7-4a58-a1c4-fa93e054e262` SUCCESS. Después del reinicio, las 3 credenciales se descifraron correctamente con salida a `/dev/null`.
- PostgreSQL n8n: dump restaurado en base aislada, 11 workflows y 3 credenciales recuperados. Base temporal eliminada. Esto comprueba restauración SQL; no una recuperación integral de la aplicación.
- Respaldos locales fuera del repositorio en `C:\Users\bafar\.railway\velodrive-recovery-2026-10-15`, protegidos con ACL y DPAPI del usuario Windows actual. La recuperación en otra máquina requiere un mecanismo adicional de custodia/exportación de la clave.
- Clave SSH temporal revocada en Railway y archivos privados temporales eliminados al pausar.

## Pendiente

- Los cambios locales están sin commit ni push. El flujo principal de 191 nodos todavía NO se importó/publicó; producción conserva la versión anterior.
- `supabase_incident_notifications.sql` NO aplicado. Su prueba de integración falló con 404 como prueba inicial esperada; falta ejecutar tras migrar.
- `VeloDrive-n8n-incidentes.json` solo registra errores: falta publicarlo, asociarlo al flujo principal y añadir el watchdog programado.
- Usuario eligió Gmail con contraseña de aplicación para enviar alertas a `rizoa1333@gmail.com`. No hay credencial SMTP creada. El usuario debe introducir la contraseña directamente en el formulario seguro, nunca en el chat.
- Publicar, probar correo recibido y verificar un mensaje nuevo de WhatsApp y su repetición sin respuestas duplicadas.
- Programar respaldos recurrentes y monitor independiente; el respaldo actual es puntual. No se midió RPO/RTO integral.
- Completar pruebas de citas y Storage entre lotes y prueba real del panel tras los nuevos permisos por columna.
- Revisar upgrade PostgreSQL 16: n8n 2.43.6 advierte compatibilidad limitada y recomienda 17 o posterior. No se actualizó durante esta intervención.

No declarar el sistema blindado ni la validación comercial final completada.

## Continuación autorizada y estado vigente

- Las tres migraciones SQL están aplicadas, incluida `supabase_incident_notifications.sql`.
- Flujo principal de 191 nodos publicado; manejador de errores y despachador de correo publicados. Rotación mensual conservada.
- 62 pruebas unitarias, 14 de navegador y 22 comprobaciones reales de aislamiento aprobadas. Concurrencia real: un propietario y un intento de envío por mensaje.
- Gmail SMTP se sustituyó por Resend HTTPS con permiso exclusivo de envío. El usuario confirmó recepción de la primera alerta.
- Error automático QA `16257` capturado y aviso aceptado por Resend; flujo temporal archivado. No se enviaron conversaciones ni datos de clientes por correo.
- Mensaje nuevo de WhatsApp respondido y recibido por el usuario. Cinco repeticiones del mismo ID conservaron ejecución, ID saliente e historial originales.
- Sigue pendiente monitor externo, copias recurrentes, custodia portable y recuperación integral con RPO/RTO medidos. El respaldo puntual y la restauración SQL no equivalen a esos controles.
- Revisión independiente no completada por límite de uso del revisor; se realizó revisión directa de permisos, transiciones y pruebas, sin atribuir aprobación externa.
