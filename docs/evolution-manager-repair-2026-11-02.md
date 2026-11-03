# Evolution Manager y vinculación: 2 de noviembre

## Estado

La navegación directa al Manager productivo devuelve 500 «Not allowed by CORS».
El mismo teléfono sí vincula WhatsApp Web oficial, pero rechaza Evolution.
Esto no demuestra que CORS sea la causa del rechazo del teléfono. La imagen
correctora está validada localmente y todavía no está promovida.

## Alcance del parche

La política CORS original se conserva literalmente. Solo se omite su ejecución
para GET/HEAD sin Origin en los prefijos públicos /manager y /assets, con rutas
ASCII inequívocas de hasta 1024 caracteres. Se rechazan porcentajes, segmentos
de traversal, barras repetidas, backslashes y prefijos parecidos. No se inventa
un Origin ni se añade Access-Control-Allow-Origin. Las rutas de API conservan
sus comprobaciones de origen y de API key.

El HTML real declara módulo JavaScript y CSS con crossorigin. El origen propio
del Manager ya está permitido explícitamente en producción; no hay comodines.
La prueba real de navegador cubre también esas peticiones con Origin.

## Artefacto y pruebas locales

- Imagen: `sha256:9a2836f080162faec200f630339c62bb112c6f991dfb5e2c032bb85fa1487c30`.
- Derivada del software congelado ya aceptado; no reinstala dependencias.
- Solo cambia dist/main.js y security/request-budget.cjs. El helper pasa de
  modo 0777 a 0644; ambos archivos conservan UID/GID 1000.
- El resto conserva 43.512 registros y 1.221.332.853 bytes, tipos, propietarios,
  modos y enlaces simbólicos. La comparación excluye montajes del runtime;
  no compara xattrs ni identidad de hardlinks. Configuración de imagen idéntica.
- BuildKit publica una copia final completa sin heredar capas del proveedor.
  El marcador anterior sigue identificando el archivo base, no esta imagen.
- Catálogo de vulnerabilidades actualizado el 2Nov a las 19:15 UTC:
  0 críticos, 0 altos, 31 medios y 1 bajo en las capas exactas locales.
- Laboratorio aislado, sin datos/credenciales productivos ni puertos Docker
  publicados: 57 migraciones, UID 1000, directorio privado 0700; API 401/401/200.
- Página, módulo y CSS reales cargan 200; navegador con fuente Inter, dos
  entradas y botón de acceso visibles, cero errores JS. Red externa bloqueada.
- Los límites de JSON/formularios, gzip, concurrencia y liberación por aborto
  conservan sus resultados 413/400/503. Métodos mutadores y origen ajeno no
  obtienen la excepción pública. Suite: 265 aprobadas, cero fallos, tres omitidas
  por requerir Linux. Revisión independiente sin bloqueo de seguridad.

Los archivos Dockerfile.manager y patch-manager.cjs reproducen el ajuste sobre
el manifiesto/payload base ya verificados. Su contexto debe incluir también
reconstruct-filesystem.cjs, harden-media.cjs y request-budget.cjs revisados.
Los archivos de software congelado y los informes grandes permanecen fuera de Git.

## Puertas pendientes

Antes de publicar: checkpoint coordinado de PostgreSQL, Redis y estructura de
sesiones, restauración aislada, compatibilidad de reversión y aceptación del
software realmente servido. Después: vinculación controlada y una entrada/una
respuesta. No borrar sesiones ni expedientes para fabricar estas pruebas.

La excepción CORS hace trabajo O(L), limitado a 1024 caracteres tras el parsing
de Express. El inventario de imagen cuesta O(N+B), con N registros y B bytes;
su buffer es de 1 MiB. No se añade ese inventario a las peticiones del servicio.
