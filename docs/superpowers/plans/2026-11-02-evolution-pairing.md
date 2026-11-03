# Recuperar la vinculación de WhatsApp

## Evidencia de partida

- n8n e6917a3f aceptado técnicamente; canaria sin respuesta porque Evolution está desconectado.
- Evolution registró logout 401 el 2Nov a las 03:53 UTC, antes del despliegue de n8n.
- Una reconexión sin borrar datos produjo QR, pero el teléfono rechaza vincularlo.
- El mismo teléfono sí vincula WhatsApp Web oficial. Esto acota el diagnóstico;
  no identifica por sí solo si falla la vigencia del QR o el cliente de Evolution.
- Navegar al Manager devuelve 500 «Not allowed by CORS», reproducido en Chrome.
- El GET connect devuelve el QR cacheado cuando la instancia está connecting;
  no reinicia el socket en ese estado. El timeout QR de la aplicación es 45 s.

## Restricciones

No borrar instancia, sesiones, conversaciones ni datos del lote. No ampliar
orígenes de la API, omitir autenticación ni forzar una versión de WhatsApp a
ciegas. No leer execution_data. Reutilizar software congelado y escanear el
artefacto final exacto. Antes de cualquier despliegue: respaldo consistente,
restauración aislada, reversión y aceptación efectiva. Mantener styles.css y
web-premium ajenos al cambio. Sin nuevos recursos cloud de pago.

## Pasos

- [x] RED: reproducir navegación Manager bloqueada sin Origin y comprobar que
  API, métodos mutadores, orígenes ajenos y rutas ambiguas siguen bloqueados.
- [x] GREEN: permitir exclusivamente navegación GET/HEAD sin Origin dentro
  de los prefijos públicos manager y assets que aparecen en el HTML real,
  conservando el middleware CORS original.
- [x] Verificar el parche sobre el JavaScript compilado exacto y probar assets
  reales del Manager en laboratorio; revisión independiente antes de promover.
- [x] Preparar imagen desde el artefacto aceptado, escanear, restaurar y ensayar
  reversión antes de publicar solo el cambio necesario.
- [x] Completar una vinculación controlada desde VeloDrive. Si el rechazo
  persiste, comparar QR directo/panel y diagnosticar protocolo/versiones con
  evidencia del consumidor real, sin cambiar dependencias a ciegas.
- [x] Confirmar CONECTADO en el panel, una entrada y una respuesta sin incidentes.
- [ ] Repetir una descarga documental nueva con la sesión vinculada.

Actualización 3Nov: despliegue c955d45d aceptado, panel CONECTADO y vinculación
confirmada por el usuario. Canaria con una entrada, una respuesta, cero
incidentes y recepción confirmada. La comparación directa del QR no se ejecutó
porque la prueba desde el panel ya vinculó; no se atribuye una causa única.
El paso final conserva pendiente únicamente la descarga documental nueva.

## Decisiones

La excepción pública no devuelve datos de API ni inventa un Origin. Solo evita
aplicar CORS a la navegación del administrador y sus assets públicos sin Origin.
El coste si se delimita mal sería acceso transversal a rutas; pruebas de método,
prefijo, codificación y traversal son obligatorias. No se declara este fallo CORS
como causa demostrada del rechazo de vinculación.
