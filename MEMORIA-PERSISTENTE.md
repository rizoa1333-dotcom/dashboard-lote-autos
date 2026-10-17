# Memoria persistente del asesor

## Comportamiento

Cada mensaje se identifica por lote, teléfono normalizado e ID de Evolution. El agente consulta `chat_history` en Supabase en cada ejecución; no depende de Simple Memory ni de la memoria del proceso de n8n. Los registros anteriores siguen disponibles.

El contexto incluye hasta 24 mensajes anteriores, ordenados por `created_at` e `id`, y los datos confirmados del lead: nombre, auto, enganche, trabajo, cita, estado y paso documental. La consulta se ancla al mensaje actual para excluirlo y excluir entradas posteriores. Los datos confirmados prevalecen sobre promesas antiguas.

El constructor valida la identidad de cada fila, elimina bloques internos y enlaces privados a documentos y limita cada entrada a 2.000 caracteres, el historial a 16.000 caracteres presupuestados y el mensaje actual a 4.000. El prompt completo no puede superar 26.000 caracteres. No envía archivos adjuntos al modelo.

## Base de datos

Aplicar `supabase_persistent_memory.sql` antes de publicar el flujo. Es una migración aditiva y repetible; no borra historial, leads, documentos o citas.

- `append_conversation_message`: inserción idempotente por lote/teléfono/rol/ID del proveedor.
- `get_conversation_context`: lectura delimitada por identidad y ancla temporal.
- `accept_conversation_reply`: bloquea el evento de inbox, valida ejecución propietaria y outbound ID, guarda la respuesta y confirma `accepted` dentro de la misma transacción. Si falla la escritura, no confirma el evento.

Los tres RPC son exclusivos de `service_role`. La credencial permanece en el servidor de n8n. RLS y permisos existentes del panel se conservan.

## Flujo

Ejecutar `node scripts/update-persistent-memory.cjs` después de los demás generadores. Regenera los RPC y el constructor embebido, desconecta Simple Memory y conecta la lectura al agente. Los reintentos se limitan a RPC idempotentes; no se añaden reintentos a los envíos de Evolution.

Las respuestas normales, documentales y de contingencia se registran con el texto enviado, sin bloques internos. Las escrituras posteriores a la aceptación son idempotentes y redundantes: permiten conservar la estructura de cierre existente, pero la aceptación ya dejó la respuesta guardada atómicamente.

Un fallo al leer historial detiene la ejecución y activa el manejador de incidentes existente. No se reemplaza la memoria por un historial vacío.

## Verificación

```powershell
npm test
npm run test:e2e
node tests/integration/persistent-memory.mjs --live-qa
```

La integración requiere `.env` local ignorado y crea lotes inactivos y usuarios efímeros sin canales de WhatsApp. Comprueba aislamiento, orden, exclusión del mensaje actual/futuro, ocho escrituras concurrentes del mismo ID, restricciones del RPC, rollback de aceptación y reintentos sin duplicar. Limpia solo sus IDs; si falla la limpieza conserva un journal en `.qa`.

Resultados del 16 de octubre de 2026: 81 pruebas unitarias, 14 de navegador e integración real de Supabase aprobadas. Se publicó la versión «Memoria persistente Supabase por lote y teléfono», 200 nodos, y se comparó su exportación con los RPC y constructor locales. El manejador de errores existente permanece configurado.

Pendiente de evidencia: prueba desde dos teléfonos, reinicio controlado y recuperación de datos distintos después del reinicio. Las pruebas de navegador usan dependencias simuladas y no sustituyen esta comprobación real.

## Límites operativos

- Persistencia no significa recuerdo ilimitado: preferencias antiguas fuera de la ventana pueden omitirse; los campos confirmados del lead sí se recuperan.
- Mensajes diferentes simultáneos de una misma conversación aún no tienen una cola FIFO. La deduplicación evita repetir un ID, pero no garantiza orden de respuestas de IDs distintos.
- Evolution y PostgreSQL no comparten transacción. Una caída después de que Evolution recibe el envío y antes del RPC puede producir un estado incierto y una alerta; no se promete entrega exactamente una vez ni se reenvía automáticamente.
- La función de aceptación elimina la ventana entre `accepted` y guardar historial, pero no elimina la ventana anterior de red descrita arriba.
- El historial no es un respaldo. No se añadieron borrado automático, retención configurable ni recuperación ante pérdida de Supabase.

## Coste y complejidad

Con índice de conversación, la consulta cuesta O(log N + k), con k <= 24. El constructor ordena O(k log k) y recorre O(C) caracteres; memoria O(k + C). Ambos presupuestos están acotados. Cada consulta añade latencia de Supabase y tokens de historial; no se añade una segunda llamada al modelo para resumir.

## Reversión

Si aparece una regresión, restaurar la versión anterior del workflow desde el historial de n8n. Las columnas/RPC nuevos pueden permanecer: son compatibles con la versión anterior. No eliminar registros para revertir. El respaldo previo y la exportación publicada están en `.qa`, fuera del repositorio.
