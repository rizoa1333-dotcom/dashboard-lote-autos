# n8n: dependencias y editor, 2 de noviembre de 2026

## Candidata final de entrega

Imagen local seleccionada: `velodrive-n8n-security:qa-20261102-flat`,
`sha256:047990ed7b47519c7aa18f7dfb5bcd33555402cddeb0f88dd3d9c78d4420b93d`.
Contiene una capa de datos y una capa vacía de metadatos, sin heredar las capas
del proveedor. Conserva usuario, variables del runtime, entrypoint, puerto y
directorio. Las variables de imagen se comparan como claves y valores únicos;
Docker cambió únicamente la posición de PATH en su lista. Se retiraron las
etiquetas de cumplimiento DHI del proveedor, que no certifican este derivado.

La comparación con la candidata lógica revisada cubrió 170.693 registros y
1.181.369.176 bytes: mismos archivos, modos, uid/gid y symlinks. Excluye ocho
rutas generadas por Docker o el kernel; no compara atributos extendidos ni la
identidad de hardlinks. El coste del inventario es O(N+B), con N registros y B
bytes de archivos; la memoria mantiene los registros y un buffer de 1 MiB.

El escaneo de las capas exactas de esta imagen arroja **0 críticos, 0 altos,
44 medios y 5 bajos** con catálogo del 1 de noviembre. Se repitieron las pruebas
de dependencias, parser, XSS, editor y ejecución JavaScript sobre el digest
047990. También se restauró el respaldo actual en una red local comprobada como
interna, con 16 workflows desactivados, cinco credenciales verificadas y 316
migraciones conservadas. La imagen anterior arrancó sin rebobinar esa base.

La validación exige además que la URL antigua del vendor devuelva 404. Una URL
nueva correcta no basta si el archivo vulnerable anterior sigue disponible.

## Rechazos protegidos y recuperación

Los intentos anteriores se revirtieron sin restaurar datos sobre producción.
El intento que vinculó la lectura a la instancia exacta comprobó que el contenedor
publicado conservaba el vendor original `1f70bef0…` junto al corregido `eeccdaaf…`.
La construcción aislada y la imagen local no tenían ese archivo original. Esto
demuestra la discrepancia observada; no determina por sí solo su causa interna
en el proveedor. El último rollback verificado previo a la candidata plana es
`001ed510-49fe-4aca-b087-d28c59d64a09`. Se revocaron las claves SSH temporales.

También se corrigió el control operativo de retiro: espera de forma acotada
durante la transición de instancias detenidas a eliminadas y sigue rechazando
instancias RUNNING o construcciones pendientes. Los journals se crean de forma
exclusiva; un reintento no sobrescribe evidencia anterior.

El USB `D:/VeloDrive-recuperacion-2026-11-02` contiene diez copias cifradas
autenticadas y cuatro snapshots cifrados de configuración. Incluye PostgreSQL
de n8n del checkpoint `2026-11-02-pre-editor-security-2`, su clave de cifrado y
entorno, además de tres checkpoints de Evolution. El paquete portable se abrió
y verificó desde el USB; no se ensayó en otra computadora. La frase temporal
protegida con DPAPI se eliminó tras exportarlo. Las fechas son independientes;
no se declara una transacción global ni recuperación completa de Supabase.

La promoción de la candidata plana y su canaria real siguen pendientes hasta
registrar su aceptación remota; los resultados locales no sustituyen esa etapa.

## Estado antes del despliegue

Candidata local: `velodrive-n8n-security:qa-20261101-editor2`, imagen
`sha256:2df9dd6aedda924574d0c4bce676564a882b916bb6b492fc39f6243a4197b104`.
Se mantiene n8n 2.45.4 y la base oficial fijada por digest. El proceso n8n usa
Node v26.12.1; la etapa auxiliar de apk no determina esa versión.

Producción comprobada antes del cambio: despliegue
`917ba2cb-dbf8-4c9f-a0a2-103d75b9a55a`, una instancia, UID 1000, volumen
`/home/node/.n8n` 1000:1000/0700, readiness 200, REST sin sesión 401 y webhook
sin autorización 401. Se conservan 27 variables configuradas, 16 workflows,
tres activos, cinco credenciales y 316 migraciones. El inventario de binarios
del volumen contiene cero archivos. No se consultó `execution_data`.

## Correcciones verificadas localmente

| Componente | Corrección |
| --- | --- |
| follow-redirects | 1.16.2 en las tres copias; prueba de retirada de credenciales entre realms |
| Vue I18n | 11.4.14; sanitizador del bundle sustituido por fuente oficial con hashes previos obligatorios |
| Markdown Node | 14.3.3; prueba de referencias adversariales y del consumidor real |
| Markdown del editor | Backport acotado de smartquotes a Markdown 13; no sustitución global incompatible |
| Vue del overlay Node | 3.5.42; elimina dependencia vulnerable del renderizador de servidor |
| Caché del editor | 349 scripts renombrados y referencias reescritas; licencias preservadas |

El escaneo local de las 23 capas exactas arroja **0 críticos, 0 altos, 44 medios
y 5 bajos**, con catálogo del 1 de noviembre. Trivy usa un ImageID diferente para
el archivo exportado; la equivalencia de contenido se verificó con los DiffIDs
ordenados y el descriptor. No constituye un SBOM del contenedor remoto.

La revisión independiente confirmó el código, digest local, descriptor y capas.
Las pruebas del navegador bloquearon las variantes XSS y procesaron el fixture
smartquotes de 600 KB en 21 ms. El lienzo, selector de nodos y búsqueda funcionaron
sin errores JavaScript ni assets ausentes. La huella del vendor servido en el
laboratorio coincide con la del archivo corregido, no solo con sus metadatos.

## Protección del cambio

El operador exige un registro de recuperación creado exclusivamente por esta
invocación. Otro proceso o reintento no puede sobrescribirlo. El intento de crear
un despliegue se guarda y sincroniza en disco antes de la llamada remota; un
timeout de esa llamada no se reintenta automáticamente.

Antes del cambio se exige detener escritores, capturar un respaldo PostgreSQL
cifrado por TLS con CA, hostname y certificado fijados, restaurarlo en una red
Docker comprobada como interna y sin miembros ajenos, verificar las cinco
credenciales sin exportarlas y ensayar reversión de imagen sin rebobinar la base.
La aceptación compara software, HTML/vendor servido, permisos, autenticación,
configuración, workflows, credenciales y migraciones.

Las ejecuciones eliminadas lógicamente (`deletedAt` no nulo) no representan
trabajos activos; el control previo filtra ese campo. Los primeros registros
observados durante las comprobaciones se retiraron por la política de retención.
No se borraron ni se forzaron como completados desde la auditoría.

La restauración del respaldo del 28 de octubre valida compatibilidad, no el
estado actual. El respaldo nuevo, su restauración y la prueba real posterior se
registrarán como evidencia separada antes de declarar el despliegue aceptado.

## Límites

- Escaneo sin altos no equivale a ausencia de vulnerabilidades.
- El respaldo PostgreSQL más clave y entorno de n8n no acredita por sí solo una
  recuperación completa de Supabase Auth/Storage ni de futuros archivos binarios.
- Los cambios se limitan al runtime y editor de n8n; se preservan los módulos del
  panel, `styles.css` y `web-premium/`.
- Una nueva prueba documental de Evolution aún requiere un expediente de prueba
  pendiente; el teléfono disponible tiene el expediente anterior completo.
