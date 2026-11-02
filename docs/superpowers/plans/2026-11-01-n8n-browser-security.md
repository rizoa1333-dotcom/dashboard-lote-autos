# n8n: cierre de dependencias de servidor y editor

Alcance: conservar n8n 2.45.4, workflows, credenciales, rotación y migraciones;
corregir consumidores concretos antes de considerar otro despliegue.

- [x] Actualizar el escaneo del artefacto local final anterior: 0 críticos y siete
  coincidencias altas correspondientes a tres avisos, con catálogo del 1 de noviembre.
- [x] Reproducir la fuga cross-realm de follow-redirects en las dos copias reales
  y la copia del overlay, usando únicamente servidores loopback ficticios.
- [x] Fijar follow-redirects 1.16.2 en manifiesto, lock y plan de consumidores.
- [x] Verificar el diff del lock y construir la candidata local con npm ci.
- [x] Probar las tres copias corregidas, HTTP, autenticación, MCP y consumidores.
- [x] Inventariar los bytes reales del editor para Markdown y Vue I18n; definir
  actualización compatible o backport acotado por huellas, incluyendo cachés.
- [x] Reproducir y corregir los casos adversariales del editor. No sustituir la
  evidencia de navegador por actualizar metadatos de paquetes Node.
- [x] Escanear las capas finales y obtener revisión independiente.
- [x] Preparar respaldo actual, restauración aislada y reversión compatible antes
  de modificar n8n productivo.
- [x] Promover imagen plana; aceptar software, editor servido, permisos, estado
  crítico y HTTP 404 del vendor antiguo. Revocar SSH temporal.
- [ ] Aceptar WhatsApp y alerta controlada después del despliegue.

La imagen Evolution del intento 7 ya está aceptada y la respuesta real de texto
está confirmada. La canaria documental nueva necesita un expediente de prueba
pendiente; el teléfono disponible conserva el expediente completo anterior.

## Evidencia local y decisiones del 2 de noviembre

La candidata lógica revisada fue
`sha256:2df9dd6aedda924574d0c4bce676564a882b916bb6b492fc39f6243a4197b104`.
La candidata final de entrega es
`sha256:047990ed7b47519c7aa18f7dfb5bcd33555402cddeb0f88dd3d9c78d4420b93d`:
publica el mismo sistema de archivos revisado en una capa de datos completa,
sin heredar capas del proveedor. La promoción anterior se rechazó al observar
el vendor antiguo adicional en el contenedor remoto. La causa interna de esa
discrepancia no queda demostrada por el escaneo local.
Se descartó la primera candidata: Markdown 14.3.2 y el peer de Vue conservaban
avisos altos. La seleccionada fija Markdown 14.3.3 y Vue 3.5.42, además de
follow-redirects 1.16.2 y Vue I18n 11.4.14. El cliente Vue existente no se reemplaza;
el cambio de Vue es del overlay Node y sus dependencias de servidor.

- Escaneo de las 23 capas verificadas: 0 críticos, 0 altos, 44 medios y 5 bajos,
  con catálogo del 1 de noviembre. No representa un escaneo remoto de Railway.
- Editor: 349 scripts con nombres nuevos, sin importaciones ausentes ni vendor
  antiguo; hashes exactos limitan los backports. Prueba adversarial de XSS
  bloqueada y smartquotes de 600 KB procesado en 21 ms en el entorno de prueba.
- Navegador con datos ficticios: lienzo, selector de nodos y búsqueda operativos;
  cero errores JavaScript y cero fallos de assets. Red externa bloqueada.
- Restauración aislada del respaldo del 28 de octubre: 16 workflows, cinco
  credenciales verificadas sin exportar su contenido, 316 migraciones sin cambios;
  arranque de la candidata y reversión de imagen sin rebobinar la base.
- La revisión independiente comprobó fuente, descriptor, digest local y capas.
  Trivy identifica el archivo exportado con otro ImageID; el vínculo de contenido
  se acredita con los DiffIDs ordenados y el descriptor, no equiparando IDs.
- Decisión: el respaldo antiguo acredita compatibilidad solamente. Antes del
  despliegue se exige respaldo actual con escritores detenidos, restauración
  aislada y comparación de configuración, workflows, credenciales y migraciones.
- Decisión: verificar también HTML y vendor realmente servidos, porque comprobar
  solo archivos dentro de la imagen no detecta un editor preparado o cacheado
  anterior. El coste de una discrepancia es rechazar y revertir la candidata.
- Complejidad: la reescritura de assets durante la construcción es O(B·F), acotada
  a 8.000 archivos y 256 MiB; no se añade trabajo a las peticiones del panel.

Pendiente operativo: el respaldo PostgreSQL y la clave de n8n no constituyen por
sí solos recuperación completa del volumen binario ni de Supabase Auth/Storage.
No se modificarán ni limpiarán expedientes existentes para fabricar una canaria.

Decisión del cierre: la imagen plana quedó aceptada en producción como
`e6917a3f-5474-4681-8a45-72ba971cecc4`. Se desconectó la referencia antigua a
n8n 2.44.6 y se comprobó que no sustituyó ni reinició la instancia corregida.
No se considera esa referencia la causa demostrada de los archivos duplicados.

Fuentes primarias: [follow-redirects](https://github.com/follow-redirects/follow-redirects/security/advisories/GHSA-mrwp-f3q8-3g9p),
[Vue I18n](https://github.com/intlify/vue-i18n/security/advisories/GHSA-83rm-6c8r-g728),
[markdown-it](https://github.com/markdown-it/markdown-it/security/advisories/GHSA-r7fv-28h4-cvq7).

Restricciones: sin cuotas cloud nuevas, secretos en Git ni lecturas de
execution_data. Preservar styles.css y web-premium. Comparar imagen exacta;
una reducción del escáner no acredita por sí sola el cierre.
