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

### Artefacto HTTP final verificado el 29 de octubre

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
