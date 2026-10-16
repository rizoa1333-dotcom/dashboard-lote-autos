# VeloDrive: robustez operativa

**Objetivo:** impedir respuestas duplicadas, proteger los campos del servidor y demostrar recuperación e aislamiento.

**Arquitectura:** PostgreSQL reclama cada ID de Evolution mediante una clave única antes de confirmar recepción. Una transición atómica autoriza un solo intento de envío; un resultado incierto exige revisión, no reenvío automático. RLS separa filas y permisos por columna protegen suscripciones y claves.

**Stack:** PostgreSQL/Supabase, n8n, Node.js, Playwright, Railway.

**Restricciones:** conservar lote QA, suscripción real, instancia conectada y rotación mensual. No guardar secretos en Git. No tocar catálogos web. No cambiar N8N_ENCRYPTION_KEY sin recuperar la clave vigente y respaldar su base.

## Ejecución

- [x] Auditar permisos y credenciales vigentes; conservar evidencia sin secretos.
- [x] Crear pruebas SQL con rollback: propietario, intruso, campos de facturación y claves del canal. Ejecutar antes y después de `supabase_tenant_hardening.sql`.
- [x] Probar funciones reales de reclamación, concurrencia, transición de envío y repetición en `tests/integration/whatsapp-reliability.mjs`; implementar `supabase_whatsapp_reliability.sql`.
- [x] Validar mensajes/instancias en Code nodes; conectar reclamación -> ACK -> procesamiento y autorización -> envío -> confirmación. Agregar pruebas VM de esos controladores y recorrido de conexiones.
- [x] Registrar incidentes por ejecución y revisar ejecuciones atascadas. Preparar Error Trigger y canal independiente de correo; no declarar alertas operativas hasta recibir una real.
- [x] Auditar Railway: clave de cifrado estable, volumen/base persistente, respaldos. Reinicio controlado solo después del respaldo y comprobación de la clave.
- [ ] Verificar respaldos/restauración en destino aislado y documentar RPO/RTO medidos; si no hay destino o credenciales, dejar el bloqueo explícito.
- [ ] Ejecutar suite completa, importar/publicar n8n, probar duplicados y mensaje nuevo QA, guardar evidencia y commit.

Suite, publicación, repetición y mensaje QA completados. El último punto queda abierto hasta guardar el commit y comprobar su respaldo remoto. Restauración SQL comprobada; recuperación integral, monitor externo y respaldos recurrentes pendientes.

## Riesgos que deben quedar cubiertos

- Dos entregas concurrentes del mismo ID no pueden iniciar dos envíos.
- Un timeout posterior al envío no puede provocar un reenvío ciego.
- Un usuario autenticado no puede cambiar plan, propietario, token ni API key.
- Un fallo antes de persistir no puede devolver ACK exitoso.
- Restaurar una base sin la clave de cifrado correcta no cuenta como recuperación.

## Registro de decisiones

- Ejecución directa autorizada por el usuario: implementar y probar sin una nueva aprobación de diseño.
- La respuesta de Evolution es aceptación; entrega se valida por estado posterior o destinatario.
- No se promete exactamente una entrega: la API externa no participa en la transacción SQL.
