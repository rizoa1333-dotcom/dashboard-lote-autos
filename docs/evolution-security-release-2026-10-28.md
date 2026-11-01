# Evolution: candidata de seguridad del 28 de octubre de 2026

**Estado: validada localmente; no desplegada.** La consulta a Railway conserva
como despliegue activo `5cee1b80-06ea-4514-bf39-78451a88d989`, del 23 de octubre.
Faltan checkpoint coordinado, ensayo de reversión y aceptación real después del
cambio. Este informe no certifica recuperación completa de VeloDrive.

## Artefacto previo y trazabilidad

**Referencia histórica, sustituida por la revisión HTTP posterior. No promover
este artefacto anterior**, aunque sus comprobaciones multimedia hayan pasado.

| Referencia | Valor |
|---|---|
| Candidata fuente | `sha256:8bf2eb37c70ee0eacb6b5656f219d7629fac34494ad47cbc9da6085a85c56e77` |
| Imagen final local | `sha256:325211b16d1494c6efc38a3842982fc6cf241b6a5262887c6333550d7af97414` |
| SHA-256 del archivo comprimido | `9885f6ad8a5e6dab003601f519258b6a02a29585251422a6ce588223a00ad66d` |
| Plataforma | Linux amd64; Node 24.22.1; usuario 1000:1000 |

Se conserva el sistema de archivos del software probado, sin volúmenes ni datos
productivos. La construcción final comprueba el SHA-256 antes de incorporar el
archivo; no vuelve a instalar paquetes APK desde un repositorio mutable.
La comparación posterior cotejó contenido, tipos, permisos, propietarios y
destinos de enlaces de **43,509 entradas y 1,221,815,688 bytes**. Excluye los
montajes propios del contenedor y el marcador de verificación añadido.
Las variables de software, entrada, usuario, directorio y puerto también coinciden.
El archivo y los informes privados permanecen en `.qa`, fuera de Git.
La revisión independiente aprobó el código y el artefacto para preparar el corte;
no sustituye las puertas de recuperación y aceptación productiva.

## Cambios delimitados

- npm 12.2.1 conserva su versión; solamente su Undici 6.29.0 se reemplaza por
  6.29.1 mediante un lock independiente y comprobaciones de versión/directorio.
- Se interceptan 17 descargas binarias del programa compilado y las descargas
  de medios de Baileys. Las consultas JSON de metadatos de Meta se conservan.
- HTTPS y puerto 443 obligatorios; sin credenciales en URL ni proxies alternos.
  La resolución utilizada por la conexión rechaza direcciones privadas,
  reservadas y respuestas DNS mixtas. Cada redirección vuelve a validarse.
- Se retiran credenciales HTTP al cambiar de origen; límite de cinco saltos,
  cuatro descargas simultáneas, 30 segundos y 16 MiB por descarga.
- Los medios entrantes cifrados se restringen además a dominios WhatsApp.
  Se propagan fallos del stream y se liberan conexiones/cupos al terminar.
- Las rutas base64/locales no cambian. Las previsualizaciones automáticas de
  enlaces permanecen desactivadas, como en la candidata anterior.

La revisión detectó un patrón demasiado amplio que podía envolver una consulta
JSON y omitir su descarga posterior. Se corrigió con una gramática de argumento
estrecha y una prueba semántica sobre el fragmento real. **La candidata media3
está descartada**; los identificadores de esta página corresponden a media4 y a
su artefacto final.

## Verificación sobre la imagen final

| Comprobación | Resultado |
|---|---|
| Suite unitaria del repositorio | 223 aprobadas, cero fallos |
| JPEG, PNG, WebP, XML, HTTP, Prisma y Socket.IO | Aprobada |
| JSON/multipart y error de Chatwoot | Aprobada con fixtures locales |
| Descifrado real de Baileys y propagación de errores | Aprobada |
| Rechazo de destino privado en la conexión real de Undici | Aprobado |
| npm CLI y su cliente HTTP corregido | Aprobados |
| Arranque con Postgres ficticio aislado | 57 migraciones; UID 1000 |
| Clave ausente / incorrecta / válida | 401 / 401 / 200 |
| URL de base de datos en log del ensayo | No detectada |
| Trivy sobre el artefacto final | 0 CRITICAL / 1 HIGH |

Base del escáner: 28 de octubre, 13:01 UTC. Los ensayos finales de esta ronda se
ejecutaron durante la tarde/noche del 28 de octubre en México. No conectaron
sesiones reales ni usaron conversaciones o credenciales productivas.
Los identificadores de configuración de Docker y de un export OCI pueden
diferir; se correlacionan por la lista completa de capas, no por semejanza de tags.

El preflight de solo lectura en producción confirmó una instancia, una sesión
con credenciales, un webhook y 57 migraciones; cero proxies por instancia activos.
No leyó conversaciones ni valores de credenciales. El acceso SSH temporal quedó
revocado después de la comprobación. El proceso actual informa Node 24.15.0 y
UID 0; la candidata se ensayó con Node 24.22.1 y UID 1000.
El preflight detectó que los dos directorios vacíos de instancias eran propiedad
de root y no admitían escritura por UID 1000. Se respaldó cifrada su estructura
y se cambiaron exclusivamente esos dos propietarios a 1000:1000. La comprobación
posterior conservó cantidades, huella de configuración y huella de migraciones;
cero archivos regulares y enlaces simbólicos. No es un respaldo de la sesión:
las credenciales continúan en Postgres.

## Riesgos y puertas pendientes

1. **Zod 3.25.76, CVE-2023-54404: abierto.** El aviso describe consumo excesivo
   al validar contenedores grandes. No se fuerza Zod 4 sobre consumidores 3.x.
   Incluso el aviso del escáner aclara que actualizar no limita contenedores
   declarados sin cota. Se requiere análisis de consumidores y límites efectivos.
2. **Recuperación coordinada:** respaldar Postgres, Redis, instancias y
   configuración con las escrituras detenidas; restaurar la copia en aislamiento
   y tener identificado el regreso al despliegue anterior antes de la promoción.
   La API de Railway confirmó `canRedeploy` y `canRollback` para el despliegue
   actual. Se descartó SIGSTOP: congelar Node no demuestra que haya terminado una
   operación lógica entre almacenes. El binario del proveedor no contiene un
   manejador explícito de SIGTERM/SIGINT; no se atribuye drenaje a esa señal.
3. **Prueba productiva:** no se declara probado el acceso a medios reales por los
   fixtures. Después del despliegue hacen falta respuesta WhatsApp y documento
   ficticio, sin ejecutar otra copia con la misma sesión.
4. **Alcance SSRF:** el parche cubre las rutas multimedia identificadas; no todas
   las integraciones configurables de Evolution. Confirmar también ausencia de
   proxies por instancia antes de cambiar el servicio.
5. **Continuidad global:** Supabase Auth/Storage y los objetivos automáticos de
   respaldo/retención siguen sujetos a su propio ensayo de recuperación.

El procesamiento de una descarga cuesta O(B) tiempo y hasta O(B) memoria al
bufferizar, con B limitado a 16 MiB y cuatro operaciones activas. Ese límite no
equivale a un límite global de memoria del proceso ni a una prueba de carga.

## Revisión posterior: presupuestos HTTP antes del parser

El análisis de consumidores confirmó un problema independiente de Zod: el
proveedor registra JSON y URL-encoded con 136 MiB antes del guard de autenticación.
La candidata `qa-20261028-http2`, imagen
`sha256:d2c802f9a616ae7e350b7cf5d8b8971a7142096edcd27b5bdb0bbea487c65da1`,
añade un middleware delante de esos parsers, sin modificar otros módulos:

- JSON: 1 MiB, incluido contenido descomprimido; URL-encoded: 64 KiB,
  1,000 parámetros y ocho niveles de anidamiento.
- Cuatro solicitudes de esos tipos pendientes como máximo y 15 segundos para
  recibir el cuerpo. El plazo se retira al terminar la recepción; no cancela
  automáticamente una operación posterior. Un cliente desconectado libera su
  cupo, por lo que esto no constituye un límite global de trabajos en ejecución.
- Respuestas 413/400 para tamaño o formato, 408 para recepción incompleta y
  503 con Retry-After cuando no hay cupo. Los errores del parser no reflejan el
  contenido recibido.
- Las transferencias multimedia grandes deben usar las rutas de URL protegidas;
  JSON base64 de más de 1 MiB queda rechazado deliberadamente.

Verificación: **231 pruebas unitarias aprobadas**. En el programa real arrancado
con Postgres ficticio se comprobaron JSON grande, fragmentado y gzip expandido
(413), JSON inválido sin reflejo (400), formulario profundo (400), exceso de
parámetros (413), cuatro cuerpos incompletos y rechazo del quinto (503), lectura
autenticada durante la saturación (200), y recuperación de cupos tras abortar.
La instancia ficticia inexistente retorna 404 para una solicitud normal: el guard
de existencia precede al de clave en esa ruta. No se cambió ese comportamiento
para acomodar la prueba.

Se repitieron las comprobaciones multimedia, compatibilidad, 57 migraciones,
UID 1000 y autenticación 401/401/200. El escaneo del 28 de octubre de esta imagen
indicó 0 CRITICAL / 1 HIGH. Los identificadores históricos de arriba no sustituyen
los del artefacto final siguiente.

### Artefacto HTTP previo del 29 de octubre (sustituido)

| Referencia | Valor |
|---|---|
| Imagen final | `sha256:efc13aa5980554ae97a984cf66591a55e700dfd0d9b3605b7d07db14cd3f05fe` |
| SHA-256 del archivo comprimido | `fa30eef2e4fa2cd37441fa3a705bff06d3e900e8522191f3925f9fb47d3f7276` |
| Entradas y contenido comparados | 43,510 entradas; 1,221,818,620 bytes |
| Migraciones frente a producción | 57; mismo hash de nombres y checksums |

La imagen congelada pasó comparación completa de configuración y archivos, el
smoke multimedia y general y el arranque con los casos HTTP anteriores. La suite
completa volvió a pasar sus 231 pruebas el 29 de octubre. Todavía no está
desplegada: resta el corte con respaldo coordinado y aceptación real.

Escaneo de esta imagen con base **29 de octubre, 13:09 UTC**: **0 CRITICAL,
0 HIGH, 29 MEDIUM y 1 LOW**. La lista de capas del informe corresponde a la
imagen final. El inventario sigue incluyendo Zod 3.25.76, pero la base nueva ya
no devuelve el aviso anterior para ese paquete. No se atribuye ese cambio de
clasificación a una actualización de Zod ni se da por reparado su comportamiento
observado. La revisión manual siguiente permanece relevante.

### Alcance del aviso Zod y otros límites

El esquema vulnerable identificado está en `@jimp/plugin-color`, método de
convolución: matrices anidadas sin límite. El ejecutable de Evolution examinado
usa Jimp para miniaturas con dimensiones escalares constantes. Baileys prefiere
Sharp; su fallback Jimp usa lectura, resize y crop. No se identificó en esos
consumidores una ruta externa a la matriz vulnerable ni llamadas del ejecutable
a los helpers Zod opcionales de OpenAI. Eso **no demuestra ausencia universal de
explotación y no cierra el aviso**. Una prueba de 32 elementos ficticios confirmó
acumulación de errores O(n); añadir `.max()` en Zod 3 no evita ese recorrido.

Multipart no pertenece al nuevo presupuesto: las rutas examinadas autentican
antes de Multer, pero su memoryStorage no tiene un fileSize explícito. Permanece
un riesgo autenticado y no se declara todo el tráfico HTTP acotado. No se
parchean funciones no utilizadas solamente para reducir el contador del escáner.

## Candidata final con sonda de salud

La sonda de Railway no envía Origin. La raíz del proveedor devuelve 500 con el
CORS estricto del ensayo, por lo que no sirve como condición de despliegue.
Se añade exclusivamente `GET /health` antes de CORS y los parsers, con respuesta
fija sin datos del negocio y Cache-Control: no-store. Las rutas de negocio
conservan la política anterior. Es **liveness**, no prueba de disponibilidad de
Postgres, Redis ni WhatsApp. La aceptación consulta además la conexión WhatsApp
en memoria mediante connectionState; un estado open persistido no es suficiente.

| Referencia de la candidata seleccionada | Valor |
|---|---|
| Imagen fuente | `sha256:5d2e9ab237047be39c8b59a46060a98725084d88ca7ec01938266401ab050faa` |
| Artefacto congelado | `sha256:2a18b97bd8f1c603dabbcd75feed9c77eb53845ba007363f3b30c7dfa3150881` |
| Archivo comprimido SHA-256 | `842c720e5cbf504dfb7407bc59f6a512acb9059b9610c2ceaa4a2ac670d083d7` |
| Equivalencia | 43,510 entradas; 1,221,818,859 bytes |

Pasaron 233 pruebas de aplicación, la equivalencia completa de archivos/config,
el arranque aislado con 57 migraciones de igual checksum, la sonda sin Origin,
la aceptación del proceso principal UID 1000 y los casos HTTP anteriores.
Escaneo exacto con base del 29 de octubre: cero críticos y altos. Esa cifra no
elimina los avisos medios ni los riesgos manuales ya descritos.

El procedimiento de corte incorpora comprobación de todos los despliegues del
servicio, cancelación de construcciones pendientes y comprobación de exclusión
antes y después de aceptar una versión. Una subida intentada sin ID remoto
confirmado bloquea la recuperación automática, aunque el cliente termine con
código cero. El registro tolera fallos durante recuperación y se dispone de un
procedimiento independiente que rechaza actuar mientras el orquestador o sus
procesos auxiliares sigan activos. El inventario de procesos falla cerrado.
Estas comprobaciones no se describen como un bloqueo distribuido frente a otros
administradores: la ventana requiere un único operador de despliegue.

### Resultado del intento de corte y recuperación

Se completó un checkpoint coordinado de Postgres y Redis con Evolution detenido:
sin clientes escritores, transacciones ni claves con caducidad en las
comprobaciones de esa ventana. La restauración local de esas mismas copias
autenticó los respaldos y verificó las 57 migraciones sin cambios, la instancia,
la sesión y las credenciales presentes. No se arrancaron sesiones reales en el
laboratorio. Es consistencia de recuperación tras parada; no se demostró un
vaciado lógico de trabajos de negocio ni una transacción entre almacenes.

El cliente de subida terminó sin identificador remoto. La reconciliación
posterior no observó despliegues nuevos ni pendientes y se recuperó la imagen
original, sin restaurar bases ni borrar datos. La recuperación
`0a4c28d2-bf92-48c5-9e5d-350c0b40a20e` pasó autenticación 401/401/200,
comprobación de la conexión WhatsApp en memoria como `open` y comparación de
los hashes de configuración y migraciones. El acceso SSH temporal fue revocado.
Las observaciones remotas no constituyen una prueba absoluta de que nunca haya
existido una operación no visible.

Una reproducción posterior en un proyecto temporal de **solo construcción**,
sin variables de aplicación, datos, volúmenes ni ejecución de servicios,
confirmó el rechazo **HTTP 413** de un cuerpo de 369,720,601 bytes. El proyecto
temporal fue eliminado. Esta prueba identifica el problema de tamaño; no
demuestra que la candidata esté desplegada.

### Entrega reducida, en validación local

El contexto alternativo reutiliza archivos de las dos imágenes base fijadas
por digest y transporta solamente el contenido faltante. El manifiesto enumera
43,511 entradas, incluido el marcador del artefacto; el payload comprimido mide
75,087,759 bytes y el manifiesto 12,921,063 bytes. El conjunto no contiene datos
de producción. No se descargan dependencias nuevas al reconstruir.

`reconstruct-filesystem.cjs` valida rutas, límites, hashes, padres, ciclos y
metadatos de enlaces antes de escribir. Construye un directorio nuevo, comprueba
cada archivo y conserva los enlaces duros. La imagen final comprueba nuevamente
el árbol completo tras la copia entre etapas. Nueve pruebas Linux pasaron,
incluidas corrupción, exceso de expansión, enlaces a padres y archivos extra.

La reconstrucción y verificación cuestan O(B + N log N) tiempo y O(N + C)
memoria: B son los bytes leídos, N las entradas y C el búfer acotado del stream.
El manifiesto admite como máximo 100,000 entradas, 1 GiB por archivo y 4 GiB en
total. Su integridad se vinculará a los hashes del contexto de entrega; los
hashes internos del manifiesto por sí solos no autentican al productor.

**Pendiente:** terminar y comparar la reconstrucción completa, escanear y probar
esa imagen exacta, validar el transporte reducido, hacer un checkpoint nuevo y
aceptar el despliegue con una prueba real. La candidata reforzada sigue sin
estar desplegada en este punto. La custodia portable de las claves de las
copias nuevas y el ensayo integral de Supabase siguen pendientes por separado.

## Revisión del 31 de octubre: candidata anterior sustituida

La imagen reducida de la primera ronda (`33920ea4d3dd...`) llegó a construirse
y pasó equivalencia con la fuente y arranque aislado. El transporte de
77,172,425 bytes fue aceptado en otro proyecto temporal de solo construcción,
que terminó con el fallo deliberado del Dockerfile y fue eliminado. No se
ejecutaron aplicaciones ni se transfirieron datos o credenciales productivas.

**No se promovió esa imagen.** El catálogo actualizado al 31 de octubre añadió
dos avisos HIGH; además, una prueba posterior detectó que el umask del builder
restringía `/tmp` a 01755. Se añadió `chmod` explícito y una verificación separada
de `/tmp` como directorio real de root, modo 01777, pues ese directorio se excluye
de la comparación del árbol de software. La prueba falla si se altera ese modo.

### Dependencias corregidas

| Dependencia | Antes | Candidata | Aviso |
|---|---|---|---|
| follow-redirects | 1.16.1 | 1.16.2 | CVE-2026-116689 |
| decode-uri-component | 0.2.2 | 0.5.1 | CVE-2026-118664 |

Avisos del mantenedor: [follow-redirects](https://github.com/follow-redirects/follow-redirects/security/advisories/GHSA-mrwp-f3q8-3g9p)
y [decode-uri-component](https://github.com/SamVerschueren/decode-uri-component/security/advisories/GHSA-qr28-fpjm-wq7f).

El diff del lock cambia únicamente esos dos registros. `query-string` 7.1.3,
consumidor del decoder a través de Minio, requiere un adaptador CJS al export
default de la nueva versión ESM. La modificación se detiene ante una huella,
versión o ancla distinta; no cambia la versión de Minio. El adaptador usa la
compatibilidad require(ESM) de la versión Node 24 fijada en la imagen.

La prueba anterior reprodujo el reenvío de una cabecera ficticia al redirigir
con `sensitiveHeaders` de otro realm y el exceso del límite de cinco segundos
con entradas URI malformadas. La candidata pasó ambos casos. Son pruebas locales
acotadas, no una garantía universal de latencia. También pasaron Minio,
JPEG/PNG/WebP, las dos ramas XML, Chatwoot, Socket.IO, cifrado multimedia real de
Baileys con datos ficticios y los controles de destinos privados.

Imagen fuente revisada:
`sha256:f748b82a9df36d0a889bd32866278642b75811571d5920fa65fdb3197960bd1f`.
Su árbol contiene 43,511 entradas de software, con huella normalizada
`082ee7dd0921b20e6ef481c30260ae4e37d1b53fddd164bb624d1c80e3b0a896`.
Escaneo con catálogo del **31 de octubre, 18:53 UTC**: **0 CRITICAL / 0 HIGH /
31 MEDIUM / 1 LOW**. No se declara resuelto el riesgo manual multipart ni los
límites de recuperación documentados anteriormente.

Pasó el arranque aislado: 57 migraciones de igual checksum, proceso UID 1000,
autenticación 401/401/200, salud 200 y límites HTTP. La sonda de aceptación
antigua solo consulta salud cuando encuentra el marcador del artefacto; en la
imagen fuente ese marcador todavía no existe. Por ello esta etapa se validó
con la solicitud directa de salud del ensayo HTTP, sin atribuir un valor 200 al
campo no consultado. La imagen final deberá pasar la sonda con su marcador.

El archivo congelado local de esta fuente tiene SHA-256
`41759523147ecb7875e84c8e3d51abfb1dfb51293712fbe63653ebf8fa564dca`.
**Sigue pendiente** terminar y probar su reconstrucción reducida exacta y
promoverla con un checkpoint nuevo y aceptación real. Los resultados de la
imagen anterior no sustituyen esas comprobaciones.

### Paquete final validado localmente

La reconstrucción final `delta-uri-20261031`, imagen
`sha256:880910ae80567ca563003d920971ca2ccfe2fd9fc651ba95808d9103834d6582`,
pasó sus propias comprobaciones, sin reutilizar el resultado de la imagen
anterior: equivalencia con la fuente, 43,512 entradas incluido el marcador,
preservación de enlaces y metadatos, escritura en su `/tmp` original como UID
1000, URI/Minio/redirecciones, multimedia, compatibilidad, arranque y las 57
migraciones. La sonda final devolvió salud 200 con el marcador esperado.

El escaneo de sus capas exactas mostró 0 CRITICAL, 0 HIGH, 31 MEDIUM y 1 LOW
con el catálogo del 31 de octubre. Su transporte medido es de 77,179,408 bytes.
La suite de aplicación pasó 244 pruebas en Windows, con dos casos Linux
omitidos allí; los nueve casos del reconstructor pasaron en Linux. Los controles
de recuperación y preparación del corte pasaron 21 pruebas adicionales.

La comprobación previa de solo lectura confirmó la versión productiva original
activa y recuperable. **Esto todavía no acredita el despliegue nuevo:** la
promoción, el checkpoint fresco y la prueba real se registrarán por separado.

## Compatibilidad con BuildKit: 1 de noviembre

El intento 4 produjo y restauró en aislamiento un checkpoint coordinado nuevo.
La subida de 77 MB fue aceptada y el build remoto llegó a reconstrucción, pero
se detuvo con `BUILD_CONTAINER_REQUIRED`: la comprobación exigía `/.dockerenv`,
archivo que BuildKit no garantiza. El programa de negocio nuevo no arrancó.
La recuperación volvió a `f217b3a9-26ca-4252-9b79-d6ff9f7dae48`, imagen original,
y comprobó sesión en memoria `open`, autenticación, migraciones y configuración
sin cambios; revocó la clave SSH temporal y no restauró datos productivos.

Se sustituyó esa heurística por una invocación explícita: Linux, flag de build,
operaciones permitidas y rutas exactas para entradas y salida nueva `/vd-root`.
Ese flag expresa intención de construcción, no demuestra aislamiento. Siguen
vigentes las validaciones del grafo, la prohibición de escribir sobre `/` y la
salida ya existente, así como los límites de bytes y archivos. Debe ejecutarse
en un constructor aislado sin datos ni credenciales de aplicación.

La corrección pasó once pruebas Linux y la suite de aplicación: 246 aprobadas,
dos casos Linux omitidos en Windows. Se construyó con BuildKit local real
(Buildx oficial, huella verificada), sin depender del builder antiguo. La imagen
`sha256:456b825848cf35d3eca20aaadf023f68b7fb536333d9dbc9ba8f61effa94be7b`
conservó el árbol y configuración de la fuente, sus 43,512 entradas con marcador,
permisos temporales, multimedia, URI, compatibilidad, salud y 57 migraciones.
El análisis de esas capas exactas el 1 de noviembre mostró 0 CRITICAL / 0 HIGH /
31 MEDIUM / 1 LOW; el contexto medido ocupa 77,179,675 bytes.

**Aún pendiente en este registro:** el intento 5 y la canaria real; una prueba
local satisfactoria no se presenta como despliegue productivo aceptado.

## Sonda de aceptación y promoción de imagen ya construida

El intento 5 construyó y arrancó la candidata en Railway, pero no obtuvo
aceptación funcional y restauró la imagen original en
`51068a17-b376-4bac-a7a6-906d0d5bd559`. Se verificaron conexión WhatsApp `open`,
autenticación 401/401/200 y las mismas huellas de configuración y migraciones.
No se restauraron datos productivos; se revocó el acceso SSH temporal.

El diagnóstico posterior comprobó que SSH observa como UID 0 sin
`CAP_SYS_PTRACE`: puede leer estado de procesos, pero no el directorio de trabajo
del proceso UID 1000. La sonda antigua interpretaba esa restricción como ausencia
del proceso. La sonda operativa nueva ejecuta su lectura como UID/GID 1000 y
mantiene la exigencia de directorio `/evolution`, marcador, salud y autenticación.
No añade privilegios a la aplicación ni modifica su imagen.

La reproducción Linux mostró el fallo del observador root y el éxito del
observador con la identidad de aplicación. El arranque completo pasó también con
esa sonda: salud 200, UID 1000, autenticación 401/401/200, límites HTTP y las 57
migraciones. La suite de aplicación pasó 247 pruebas; tres casos específicos de
Linux se omiten en Windows. Los controles operativos del siguiente intento
pasaron 26 pruebas, incluyendo persistir la intención antes de la mutación y
abortar si no se puede escribir el journal.

El intento 6 está preparado para reutilizar la imagen ya construida, con un
checkpoint coordinado nuevo, restauración aislada y recuperación de la imagen
anterior. **Todavía no se presenta como aceptado ni como canaria real.**

## Directorio privado de instancias: 1 de noviembre

El intento 6 inicial se detuvo por SSH antes de parar el servicio. Su reintento
completó respaldo coordinado y restauración aislada; arrancó la imagen nueva y
verificó UID 1000, salud 200, autenticación y las mismas huellas de migraciones y
configuración. La conexión en memoria no se recuperó: el endpoint devolvía el
nombre de instancia sin estado. El diagnóstico saneado identificó `EACCES` al
crear `/evolution/instances`. La carpeta padre de trabajo permanece protegida y
la imagen carecía del subdirectorio escribible por la aplicación.

La aceptación rechazó esa condición y restauró la imagen anterior en
`4ffa6da4-8029-49d2-a815-0293003b9b28`, comprobando conexión real `open` y retirando
el acceso SSH temporal. No hubo restauración de datos productivos.

La corrección crea únicamente `/evolution/instances`, UID/GID 1000 y modo 0700.
La reconstrucción exige que no exista una ruta ni enlace previo antes de crearla.
No se amplía la escritura del directorio de la aplicación. La prueba aislada
falló por carpeta ausente en la imagen anterior y pasó con la nueva, incluyendo
crear y retirar un archivo ficticio y comprobar `/tmp` 01777.

La imagen BuildKit local
`sha256:a2704b98c83f501fbc165536cc78764bbcc1fb5d63261e8d4273de8c67208c67`
conserva la configuración y todo el árbol base; la única adición es esa carpeta
vacía. El marcador `417595...` sigue identificando el archivo base congelado,
**no la imagen completa con esta adición**. La huella de la imagen, el contexto
exacto, la comparación del árbol y la comprobación explícita de permisos se
registran por separado. El contexto medido ocupa 77,179,711 bytes.

Pasaron nuevamente arranque aislado, 57 migraciones, sonda con identidad de
aplicación, límites HTTP, compatibilidad y multimedia. La promoción del intento 7
y la prueba real siguen pendientes; no se infiere conexión productiva por el
solo hecho de haber arrancado con una base ficticia.
