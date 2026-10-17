# Memoria persistente de conversaciones

**Objetivo:** recuperar el contexto después de reiniciar n8n sin mezclar lotes ni teléfonos.

**Arquitectura:** `chat_history` será la fuente de mensajes. Un RPC devuelve los últimos 24 mensajes de una conversación ordenados cronológicamente y excluye la entrada actual. Otro RPC registra mensajes de forma idempotente por lote, teléfono, rol e ID del proveedor. Un constructor puro valida identidad, limita el texto y añade datos confirmados del lead al prompt. Simple Memory queda desconectada.

**Stack:** Supabase/PostgreSQL, n8n, JavaScript con JSDoc, Node test y Playwright.

## Restricciones

- Conservar lotes, documentos, citas, suscripción y rotación mensual.
- No copiar adjuntos, URLs privadas, secretos ni bloques internos al contexto del modelo.
- Fallar ante errores de recuperación; no sustituirlos silenciosamente por memoria vacía.
- No resumir con otra llamada de IA ni crear una segunda tabla de historial.
- La deduplicación por ID no equivale a serialización de mensajes diferentes de una misma conversación; dejar explícito ese límite.

## Pasos

- [x] Escribir regresiones para identidad, orden, límites, exclusión de entrada actual y recuperación con una instancia nueva del constructor.
- [x] Añadir migración aditiva con índices y RPC de lectura/escritura, exclusivos de service_role; probar concurrencia e idempotencia con fixtures exactos.
- [x] Implementar constructor de contexto acotado y generador n8n. Recuperar campos confirmados, desconectar memoria volátil y registrar respuestas normales, documentales y de contingencia una vez.
- [x] Aplicar SQL y publicar n8n, preservando configuración y credenciales existentes; comparar exportación con el archivo local.
- [ ] Ejecutar suite y pruebas reales con dos teléfonos, reiniciar n8n de forma controlada y verificar continuidad. No declarar prueba de reinicio sin evidencia posterior.
- [ ] Documentar evidencia, limitaciones y commit; comprobar respaldo remoto.

## Revisión

Identidad ausente, fila ajena, historial corrupto, respuesta del proveedor vacía, llamadas repetidas, texto extremadamente grande, errores de base de datos y contexto contradictorio con el lead deben quedar cubiertos.

La consulta indexada cuesta O(log n + k), con k acotado; construir contexto cuesta O(c) y usa O(c) memoria, con presupuesto explícito de caracteres.

## Registro de ejecución

- Migración inicial: prueba RED HTTP404; después GREEN en Supabase real.
- Revisión independiente encontró ventana accepted/historial; corregida con accept_conversation_reply transaccional. Regresión RED y GREEN; integración comprueba rollback y reintento.
- 81 unitarias, 14 E2E, integración real aprobadas.
- n8n publicado con 200 nodos, exportación comparada, errorWorkflow preservado.
- Pendiente prueba humana de dos teléfonos y reinicio controlado.
- Ruling: conservar ventana de 24 mensajes y campos confirmados, sin resumen adicional — coste acotado — preferencias antiguas pueden salir de contexto.
