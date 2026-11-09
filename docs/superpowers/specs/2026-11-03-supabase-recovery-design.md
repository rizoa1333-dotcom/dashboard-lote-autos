# Recuperación Supabase e aislamiento

Objetivo autorizado: cerrar recuperación, aislamiento y capacidad sin añadir
servicios cloud de pago ni cambiar los módulos comerciales. El propietario
pidió dejar para el final los pasos que requieren su intervención.

## Estado de partida

- VeloDrive, n8n y Evolution saludables; WhatsApp vinculado y canaria confirmada.
- Storage contiene 6 imágenes públicas y 13 documentos privados, unos 2 MB.
- La contraseña PostgreSQL introducida fue rechazada. El transporte de la
  contraseña y el certificado oficial se comprobaron sin mostrar credenciales.
- No se cambiará esa contraseña ni se repetirá su captura mientras el usuario
  prefiera aplazar los pasos manuales.

## Diseño y límites

1. Copiar Storage con la clave de servidor vigente, exclusivamente desde el
   proyecto verificado. Listados paginados, rutas validadas, límites explícitos,
   ninguna redirección con credenciales y ningún contenido en logs.
2. Un archivo AES-256-GCM por objeto, nombres de archivo derivados de SHA-256,
   manifiesto también cifrado y claves protegidas localmente mediante DPAPI.
   Los datos privados se guardan fuera de OneDrive. Comparar inventarios antes
   y después; si cambian, no declarar completo el punto de copia.
3. Reutilizar el formato portable existente. Permitir hasta 256 archivos por
   paquete conservando el límite de 64 MiB por archivo y explicitando el límite
   total anterior de 1 GiB. No elevar el presupuesto máximo de datos.
4. Restaurar las copias en memoria o tmpfs local aislado, verificar cada hash
   y conservar configuración de buckets y rutas originales en el manifiesto.
   Esto prueba recuperación de archivos; no sustituye restaurar la base,
   Auth, políticas y configuración de plataforma.
5. La fase PostgreSQL requiere acceso válido. Capturar roles/esquemas/datos,
   modificaciones de auth/storage y secretos necesarios bajo cifrado; probar
   restauración con versiones compatibles y sin servicios externos activos.
6. Reutilizar y corregir las pruebas de aislamiento existentes. Antes de
   ejecutar fixtures, revisar triggers y acciones externas; nada debe enviar
   mensajes, publicar ni cobrar a causa de una prueba. Preferir rollback para
   la comprobación SQL y credenciales sintéticas para comprobar la API.

No se copiarán tokens de sesión del navegador. No se leerá execution_data.
No se borrarán sesiones, expedientes ni filas de clientes. styles.css y
web-premium/ quedan fuera del trabajo. Los respaldos no se confundirán con una
transacción global; fechas, alcance, custodia y pruebas quedan separados.

## Aceptación

Pruebas RED/GREEN de paginación, cambio concurrente, rutas hostiles, límites y
cifrado. Copia real autenticada y restauración local sin secretos en texto
claro persistente. Informe con conteos, hashes y pendientes reales. La fase
completa no se marca terminada sin PostgreSQL/Auth y su restauración.
