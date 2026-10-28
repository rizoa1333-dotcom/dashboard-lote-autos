# n8n: autenticacion, configuracion y limites MCP

Fecha: 28 de octubre de 2026. Alcance: imagen de n8n; no certifica la seguridad
de Evolution, Supabase, Stripe ni de la aplicacion completa.

## Candidata validada

Base oficial n8n 2.45.4, digest
`sha256:80e23ced901f0e22597d4f3464e3aaf9d835372262ea6f08ef760d8ca35df25c`.
Imagen local `velodrive-n8n-security:qa-20261028-mcp-final`, ID
`sha256:45651ab23ec3` (prefijo). Conserva el usuario no privilegiado UID 1000.

| Cambio | Version o limite |
| --- | --- |
| TOML, consumidor real Snowflake | 5.0.1 |
| MSAL Node, dos consumidores v5 | 7.1.0, common 16.14.2 |
| MSAL usado por Azure Identity | 3.8.4 conservado |
| MCP SDK | 1.32.0 |
| MCP server/core | 2.3.0 |
| MCP adaptador HTTP Node | 2.1.0 |
| Zod para MCP server/core | 4.6.6, sin reemplazo global de Zod v3 |
| Argumentos de herramientas MCP | 10 000 elementos agregados, profundidad 64 |
| Sobre MCP completo | 20 000 elementos, profundidad 68, 16 MiB decodificados |
| JSON-RPC | Maximo 100 mensajes por lote |

El adaptador HTTP actualizado impone ademas su limite predeterminado de 4 MiB.
La autenticacion existente precede a los nuevos controles. El controlador y el
webhook rechazan entradas excesivas antes de serializar, obtener herramientas,
validar esquemas o ejecutar handlers. Arrays se rechazan por longitud antes de
enumerar indices. Los IDs reflejados se limitan tambien por su longitud codificada.

La inspeccion es iterativa: tiempo O(n) y memoria O(n), ambos acotados por los
presupuestos. El analisis JSON inicial tambien queda sujeto al limite de bytes;
no se promete memoria constante ni proteccion contra concurrencia ilimitada.

Los cuatro archivos del proveedor requieren SHA256 exacto. Un cambio de estructura
o version detiene la construccion antes de modificar esos archivos. Los consumidores
de SDK v1 conservan Zod 3.25.76: imponer Zod v4 a n8n pierde restricciones en
`zod-to-json-schema` y rompe esquemas de configuracion verificados en investigacion.

## Evidencia previa al despliegue

- Suite completa: 211 pruebas unitarias, cero fallos.
- Imagen final: consumidores reales de Git, promociones, source control, 13
  plantillas de correo, HTTP comprimido/multipart, redirects y ambas ramas Undici.
- MSAL: client credentials, cache serializada/restaurada, OBO y rechazo de cliente
  invalido mediante transporte simulado, sin solicitudes a Microsoft.
- TOML: lector real de Snowflake, configuracion valida, errores de sintaxis,
  enteros inseguros y ausencia de mutacion del prototipo.
- MCP: dos clientes concurrentes, aislamiento de sesiones y tareas, limite exacto,
  rechazo previo al esquema y recuperacion tras una solicitud rechazada.
- Controlador y webhook reales: autenticacion normal/OAuth antes del control;
  entradas profundas o excesivas rechazadas antes del parser y transporte.
- Revision independiente: sin bloqueos de codigo tras corregir metadata profunda,
  enumeracion de arrays y escape de IDs.
- Respaldo consistente nuevo, TLS verificado, cifrado directo AES256GCM y clave
  protegida mediante DPAPI. Sin exportacion en claro de credenciales.
- Restauracion sin Internet ni puertos publicados: 16 workflows desactivados en
  la copia, 5 credenciales descifrables, 316 migraciones antes y despues.
- Arranque de candidata y reversion a la imagen productiva anterior probados;
  huellas de workflows y credenciales conservadas, sin retroceder la base.

## Escaneo y limites de la conclusion

Trivy 0.76.1 sobre el tar de la imagen final; base de avisos actualizada
2026-10-28 13:01 UTC. Resultado: **0 CRITICAL / 2 HIGH**.

| Hallazgo abierto | Motivo para no declararlo corregido |
| --- | --- |
| markdown-it 13.0.2, CVE-2026-111759 | El editor incluye tambien el parser dentro del bundle del navegador. Sustituir el paquete Node no cambia esos bytes ni invalida caches. Requiere reconstruccion compatible del editor o mitigacion del bundle con pruebas de navegador. |
| Zod 3.25.76, CVE-2023-54404 | Cambio global a v4 incompatible con consumidores actuales. Los limites MCP reducen una superficie concreta, pero no demuestran cobertura de todas las entradas y respuestas internas de n8n. |

Referencia oficial del adaptador HTTP:
[GHSA-f897-62hf-6gxq](https://github.com/modelcontextprotocol/typescript-sdk/security/advisories/GHSA-f897-62hf-6gxq).
El aviso exige actualizar cada adaptador instalado; actualizar solamente el servidor
deja otra dependencia vulnerable.

La imagen reconstruida por Railway no es el mismo artefacto OCI local. El escaneo
anterior corresponde a la imagen local validada, no a una extraccion de la imagen
remota. Las comprobaciones posteriores del despliegue se registran por separado.

## Despliegue

Destino: servicio n8n existente. Despliegue solicitado:
`917ba2cb-dbf8-4c9f-a0a2-103d75b9a55a`.
Railway confirmo **SUCCESS**. Comprobaciones posteriores:

- 16 workflows, 3 activos, 5 credenciales y 316 migraciones conservados.
- IDs de versiones activas y huellas de las 27 variables configuradas sin cambios.
- Readiness publico HTTP 200 y webhook WhatsApp sin token HTTP 401.
- El primer comprobador HTTP agoto el tiempo de conexion; la repeticion por IPv4
  devolvio los estados esperados. No se cambio la configuracion por ese resultado.
- El usuario envio «Hola, prueba final 28» y confirmo respuesta del agente despues
  del despliegue. Esto comprueba entrega real; no demuestra todos los escenarios
  de WhatsApp, pagos, documentos ni redes sociales.
- Contenedores temporales de restauracion retirados; no se registraron claves SSH.
