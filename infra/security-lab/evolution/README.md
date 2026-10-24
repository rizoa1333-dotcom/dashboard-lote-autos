# Candidata local de Evolution 2.3.7

Estado: laboratorio, **no desplegada**. No es una autorizacion para promoverla.

Conserva la aplicacion compilada del digest estable y actualiza Baileys a rc13,
Node a 24.22.1, npm a 12.2.1 y correcciones de proxy-addr/XML y transporte.
Instala dependencias con `npm ci` desde el lock revisado, regenera Prisma y
ejecuta con UID 1000. El parche del arranque elimina la impresion de DATABASE_URL
sin cambiar los pasos de migracion ni su manejo de errores.

Construir desde esta carpeta con Docker local:

```sh
docker build --tag velodrive-evolution-security:local .
```

No proporcionar variables, sesiones ni volumenes de produccion a la construccion.
Los paquetes APK se resuelven desde repositorios actualizables: el lock npm y los
digest base no hacen reproducibles sus bytes. Registrar SBOM y digest de la imagen
final y volver a escanear cada reconstruccion. Promover un artefacto ya verificado;
no asumir que otra construccion equivale a la que paso las pruebas.

Evidencia local del 2026-10-24:

- Imagen inicial 20192e8fef29 y reconstruccion con lock aad522c1e4dd.
- Trivy 0.76.1: ambas tienen 0 coincidencias CRITICAL y 69 HIGH; la base
  desplegada tenia 8 CRITICAL y 208 HIGH. Esto no prueba ausencia de vulnerabilidades.
- Modulos y API requerida de Baileys cargan con Node 24.22.1.
- Las pruebas unitarias de la transformacion verifican version esperada,
  idempotencia, conservacion de dependencias ajenas y retirada del log sensible.
- Arranque con Postgres ficticio aislado: 57 migraciones completadas, UID1000,
  solicitudes sin clave/clave erronea401 y clave valida200. Sin URL de base en logs.

Segunda ronda, imagen `a2eb03be9fb93acd68a9a2532fe93acd5b96d2ca3e093d87f3b0fcd0ab5531c8`
(tag local `qa-20261024b`):

- Axios 1.20.0 y rama antigua 0.32.0, Undici 7.29.1, Sharp 0.35.5,
  Multer 2.3.0, ws 8.21.0, Engine.IO 6.6.10 y Socket.IO parser 4.2.7.
- Trivy del artefacto exportado: 0 CRITICAL y 20 HIGH. Quedan dos avisos de Axios
  antiguo y avisos de otras dependencias; no confundir esta mejora con cierre total.
- `compatibility-smoke.cjs` ejecutado dentro de esa imagen con red deshabilitada:
  JPEG/PNG/WebP, XML4/5, HTTP y redirects, SDK Chatwoot con JSON, adjunto multipart,
  autenticacion ficticia y error401; Socket.IO por websocket y polling con binarios.
- El cambio de Sharp 0.34 a 0.35 y Axios 0.27 a 0.32 cruza rangos de compatibilidad.
  Las pruebas anteriores cubren estas rutas concretas, no todas las integraciones.
- Nuevo arranque aislado: 57 migraciones, UID1000,401/401/200 y sin URL sensible en logs.

Repetir la prueba de compatibilidad desde la raiz del repositorio (PowerShell):

```powershell
Get-Content infra/security-lab/evolution/compatibility-smoke.cjs -Raw |
  docker run --rm -i --network none --read-only --cap-drop ALL `
    --security-opt no-new-privileges --memory 512m --pids-limit 128 `
    --entrypoint node velodrive-evolution-security:qa-20261024b
```

Antes de promover: evaluar hallazgos altos, respaldar tambien Evolution y probar una conexion real
controlada con posibilidad de volver al digest anterior. La prueba de registro y
pago del dashboard no sustituye estas comprobaciones.

La transformacion del manifiesto cuesta O(n) tiempo y espacio respecto al tamano
del manifiesto; no procesa conversaciones ni datos de tenants.
