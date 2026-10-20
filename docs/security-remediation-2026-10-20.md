# Estado de remediacion de seguridad - VeloDrive

Fecha: 2026-10-20. Rama: fix/security-20261019. Este documento complementa la auditoria del 18-10; no equivale a una certificacion de ausencia de vulnerabilidades.

## Evidencia actual

- 105/105 pruebas unitarias y 14/14 pruebas Playwright aprobadas. Servicios externos simulados en E2E; no se ejecutaron cargos.
- npm audit --omit=dev: cero vulnerabilidades. No cubre imagenes de n8n/Evolution sin SBOM.
- Produccion: seis comprobaciones de autenticacion aprobadas; canal WhatsApp conectado despues del reinicio.
- App c3230c6 desplegada; n8n publicado con 210 nodos y autenticacion separada. Migraciones de facturacion, tenants y trigger de citas aplicadas.

## Hallazgos

| ID | Estado | Evidencia o condicion pendiente |
|---|---|---|
| C01 | Corregido en app | proxy-addr 2.0.8; audit limpio; imagenes externas fuera de alcance |
| H01 | Corregido en flujo actual | Stripe Trigger de n8n desactivado y desconectado; backend es escritor del flujo actual; dos destinos antiguos deshabilitados. Otro destino de instalacion 7c40 pendiente de atribucion |
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
| M06 | Pendiente | Cancelar peticiones y limpiar caches al cerrar/cambiar cuenta |
| M07 | Pendiente | Modo catalogo no es una frontera de seguridad; evitar descargar campos privados |
| M08 | Pendiente | Limites de documentos, MIME real y consumo de memoria de base64 |
| M09 | Pendiente | CSP y fijacion de scripts externos |
| M10 | Pendiente | Limites por ruta y almacenamiento distribuido; no limitar webhooks como trafico interactivo |
| M11 | Pendiente | Restringir CORS de Evolution y credenciales a origenes necesarios |
| M12 | Pendiente | FK compuesta que vincule gasto, vehiculo y lote |
| L01 | Corregido en funciones identificadas | search_path fijo y permisos de ejecucion restringidos; trigger de citas usa Vault |
| L02 | Pendiente | Fijar digests y escanear imagenes de n8n/Evolution |

## Riesgos residuales que impiden afirmar cierre total

1. Rotacion cerrada: anterior HTTP 401 y nueva HTTP 200; mantener inventario de consumidores para siguientes rotaciones.
2. Destino Stripe de otro n8n no atribuido; no se desactiva sin identificar su servicio.
3. Payment Links reutilizables: dos compras abiertas antes de asociar la suscripcion aun pueden generar doble cobro. El bloqueo de cuenta vinculada reduce el riesgo pero no sustituye Checkout Sessions idempotentes.
4. notificacion_auto_nuevo requiere identificar consumidor, autenticacion y utilidad antes de retirarlo o corregirlo.
5. Cambios productivos desplegados por CLI aun no respaldados en GitHub: integrar esta rama antes del siguiente despliegue desde main.

## Orden siguiente

Revocar y verificar clave antigua; atribuir entradas heredadas; respaldar rama remota; cerrar M06/M07/M08 y luego configuracion de infraestructura y dependencias de contenedor. Mantener pruebas de aislamiento por operacion y pruebas reales sin documentos personales.
