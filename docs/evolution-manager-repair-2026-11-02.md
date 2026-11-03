# Evolution Manager y vinculación: 2 de noviembre

## Estado

El parche quedó aceptado en producción en el despliegue
`c955d45d-330a-4f5b-bbaf-38a205218605`. El 3 de noviembre el usuario confirmó
la vinculación desde VeloDrive y el panel mostró CONECTADO. La prueba posterior
registró un evento completado, una entrada, una respuesta y cero incidentes
del lote de prueba; el usuario confirmó que recibió una sola respuesta.
Solo se consultaron identificadores y conteos, sin contenido de conversaciones
ni execution_data. La descarga documental nueva todavía no fue repetida:
el contacto utilizado conserva su expediente completo y el agente lo reconoció
sin reiniciar la recolección ni solicitar otra identificación.

La navegación directa al Manager pasó de 500 «Not allowed by CORS» a 200;
sus dos assets también devolvieron 200. Esto no demuestra que CORS fuese la
causa única del rechazo anterior del teléfono.

El 3Nov a las 07:14 UTC la comprobación pública HTTPS por IPv4 devolvió 200
para VeloDrive /health, n8n /healthz y Evolution /health. La prueba anterior
con fetch terminó en timeouts de conexión en esta computadora; se conserva
como resultado inconcluso, sin convertirlo en una caída demostrada del servidor.

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
  obtienen la excepción pública. Suite final: 267 aprobadas, cero fallos, tres omitidas
  por requerir Linux. Revisión independiente sin bloqueo de seguridad.

Los archivos Dockerfile.manager y patch-manager.cjs reproducen el ajuste sobre
el manifiesto/payload base ya verificados. Su contexto debe incluir también
reconstruct-filesystem.cjs, harden-media.cjs y request-budget.cjs revisados.
Los archivos de software congelado y los informes grandes permanecen fuera de Git.

## Publicación y recuperación

El primer intento productivo se interrumpió después de capturar PostgreSQL:
falló una lectura de metadatos por SSH antes de capturar Redis. No se subió
el candidato ni se restauraron datos sobre producción. La reversión de imagen
quedó aceptada en `c5064c93-0327-46f9-816d-b435b4c59470`; el acceso SSH temporal
fue revocado. Las lecturas posteriores no reprodujeron el fallo, por lo que
no se atribuye una causa al proveedor. El segundo procedimiento fijó las
instancias de almacenamiento y reprodujo el corte en una lectura de metadatos;
también revirtió sin restaurar datos sobre producción y revocó el acceso temporal.

La prueba independiente de solo lectura reprodujo cortes intermitentes con
el servicio activo. El tercer procedimiento añadió hasta tres intentos para
errores reconocibles de transporte en lecturas. Los errores de autorización,
respuestas desconocidas y las escrituras no reciben ese reintento.

Antes de publicar se capturó el checkpoint cifrado con Evolution detenido:
PostgreSQL 170.536 bytes, Redis 983.807 bytes y estructura 2.048 bytes. Se
verificaron cero clientes de aplicación y transacciones en PostgreSQL, y solo
el observador en Redis, sin claves con expiración. La restauración aislada
conservó las 57 migraciones y su hash, una instancia, una sesión con credenciales,
un webhook y las cinco claves de Redis. No se inició WhatsApp en el laboratorio.
Las imágenes nueva y anterior aceptaron las mismas migraciones sin modificarlas.

La aceptación productiva verificó UID 1000, directorio privado 0700, hashes del
parche, API 401/401/200, configuración conservada y ausencia de otro despliegue
activo. El acceso SSH temporal fue revocado.

El 3Nov se exportaron y autenticaron desde el USB los tres archivos cifrados
y una configuración, con un paquete de claves portable protegido mediante
frase y verificado por descifrado autenticado. Destino:
`D:/VeloDrive-recuperacion-2026-11-03-Evolution`. Los paquetes anteriores se
conservaron y el archivo temporal DPAPI de la frase se eliminó tras verificar
la copia. La evidencia está en .qa/evidence/usb-recovery-manager-20261103.json.
Este checkpoint es anterior a la vinculación nueva: recuperar desde él puede
requerir escanear el QR otra vez; no garantiza conservar la sesión actual.
No contiene n8n, que permanece en su paquete anterior del USB. No se realizó
un ensayo en otra computadora. La recuperación integral de Supabase Auth/Storage
sigue fuera de esta prueba.

Los diarios y resultados están en .qa/evidence/evolution-manager-cutover-attempt3-20261102.json,
evolution-isolated-restore-20261102-manager-attempt3-restore.json y
evolution-manager-postdeploy-canary-20261103.json. No borrar sesiones ni
expedientes para fabricar pruebas documentales nuevas.

La excepción CORS hace trabajo O(L), limitado a 1024 caracteres tras el parsing
de Express. El inventario de imagen cuesta O(N+B), con N registros y B bytes;
su buffer es de 1 MiB. No se añade ese inventario a las peticiones del servicio.
