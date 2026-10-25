# Recuperacion portable de VeloDrive

## Paquete verificado el 25 de octubre de 2026

Ubicacion entregada: `D:\VeloDrive-recuperacion-2026-10-25`.
Contiene cinco respaldos cifrados: dos instantaneas anteriores de Postgres n8n,
Postgres Evolution, Redis Evolution y el archivo de instancias de Evolution.
Las claves, las claves de cifrado de n8n y cuatro instantaneas de configuracion
estan dentro de `recovery-keys.encrypted.json`, protegido con la contraseña
introducida por el propietario. No depende de DPAPI ni del perfil Windows original.

Proteccion: scrypt N=131072, r=8, p=1 y AES-256-GCM, sal y nonce aleatorios.
Cada archivo escrito se relee y compara por SHA-256. La verificacion final abre
el sobre desde el USB y autentica todos los respaldos con las claves recuperadas.
La contraseña temporal protegida por DPAPI se retira solo despues de comprobarlo.

Guarda el USB fuera del equipo y la contraseña en un lugar independiente. Perder
la contraseña impide recuperar el paquete. Conserva tambien acceso a Railway,
Supabase, Stripe y los demas proveedores; este paquete no reemplaza esas cuentas.

## Verificar sin extraer secretos

En una computadora de confianza con Node 24.22.1, abre una terminal interactiva:

```powershell
node "D:\VeloDrive-recuperacion-2026-10-25\tools\recovery-package.cjs" verify "D:\VeloDrive-recuperacion-2026-10-25"
```

Escribe la contraseña cuando la pida. No se muestra ni se recibe como argumento.
El resultado debe indicar cinco respaldos verificados y `plaintextExported:false`.
Esta comprobacion valida el cifrado; no sustituye una restauracion de servicios.

## Extraccion explicita durante una recuperacion

`extract` requiere un destino nuevo, autentica todos los archivos antes de escribir
y produce respaldos y configuracion **sin cifrado**. Ejecutalo solo en un equipo
de recuperacion protegido, con acceso restringido, fuera de OneDrive y del USB:

```powershell
node "D:\VeloDrive-recuperacion-2026-10-25\tools\recovery-package.cjs" extract "D:\VeloDrive-recuperacion-2026-10-25" "C:\VeloDrive-recuperacion-privada"
```

Los modos Unix 0600/0700 no configuran ACL de Windows. Verifica los permisos del
destino antes de extraer. No subas `service-configuration.json` ni los volcados
descifrados a Git, correo o almacenamiento compartido. La herramienta no conecta
a bases ni modifica servicios; la restauracion requiere un procedimiento separado.

## Alcance probado y pendientes

- n8n: restauracion local aislada, workflows desactivados y cinco credenciales
  descifrables; no se enviaron mensajes desde la copia.
- Evolution: restauracion en Postgres 17.11; 57 migraciones, una instancia,
  una sesion y sus credenciales presentes. La candidata no cambio las migraciones.
- Redis: RDB de 8.2.1 validado y restaurado en 8.2.10 aislado; cinco claves.
- Archivo de instancias: estructura validada y extraida; dos directorios, cero archivos.
- Las sesiones reales de WhatsApp no se arrancaron en el laboratorio.
- **Pendiente:** respaldo completo y restauracion de Supabase, incluidos Auth y Storage.
- **Pendiente:** checkpoint coordinado de Postgres y Redis con escrituras detenidas.
  Las copias verificadas por separado no garantizan consistencia entre almacenes.
- **Pendiente:** frecuencia automatica, retencion, segunda custodia y objetivos RPO/RTO
  medidos. Un USB puntual no equivale a un plan de continuidad completo.

La verificacion cuesta O(B) tiempo y O(M) memoria, donde B es el total y M el
mayor archivo; cada archivo esta limitado a 64 MiB. La derivacion de contraseña
requiere aproximadamente 128 MiB mas sobrecarga y usa un limite de 256 MiB.
