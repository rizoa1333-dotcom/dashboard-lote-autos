# Correccion de Ver Perfil — 26 de octubre de 2026

Causa reproducida con HTTP/CSS reales: Tailwind aplica translate como propiedad
independiente. drawer-open solo restablecia transform, dejando el panel fuera
del viewport mientras el overlay difuminaba el fondo. Regresion RED: izquierda
del panel1365px en viewport1365px. Se corrige translate en feedback.css, sin
alterar styles.css preexistente.

El perfil muestra sus datos disponibles inmediatamente y consulta documentos/
conversacion en paralelo. Un fallo parcial mantiene el perfil utilizable con
mensaje de error; no deja solo el fondo bloqueado. Documentos y mensajes antiguos
se limpian antes de cargar otro prospecto. Las respuestas se validan por lote,
lead y generacion del drawer, incluso al cerrarlo y reabrir el mismo lead.

Las acciones de pausa/reactivacion tambien respetan esa generacion. Un callback
obsoleto libera su bloqueo sin cambiar el DOM del nuevo perfil; despues consulta
el estado vigente de la conversacion actual. Cerrar sesion limpia el perfil,
historial y enlaces a documentos, ademas del dashboard.

El dialogo tiene nombre accesible, Escape, foco contenido, regreso al control de
origen y fondo inert. En movil se ordenan datos/documentos verticalmente; el chat
conserva su disposicion flex. Se respeta movimiento reducido.

Validacion:200unitarias y45E2E aprobadas; capturas escritorio/movil inspeccionadas.
Incluye consulta lenta, error de historial, cambio de lead con documento tardio,
cierre de sesion y pausa pendiente en una conversacion anterior. Datos ficticios;
no se modificaron conversaciones ni documentos de produccion en estas pruebas.
Trabajo de render O(n) respecto a mensajes/documentos mostrados; guardas y cierre
son O(1) salvo busqueda del boton de retorno en la lista de leads renderizada.

## Desplazamiento tactil — 27 de octubre de 2026

Se reprodujo el fallo comunicado por el usuario: los paneles Datos, Docs y Chat
superaban la altura de su contenedor flex. El recorte exterior ocultaba contenido
y el gesto no desplazaba el area esperada. Tres pruebas con CSS real fallaron
antes de corregir la altura; otra detecto el cierre de solo 36px de ancho.

Correccion: `min-height: 0` en paneles e historial; por debajo de 1024px los
paneles ocupan el espacio restante con `flex: 1 1 0%`. Datos y Docs controlan su
scroll; Chat conserva el scroll en el historial. Encabezado, pestanas y cierre
permanecen disponibles. No cambia la consulta ni el aislamiento de conversaciones.

Se incorporan semantica tablist/tab/tabpanel, seleccion y paneles inactivos inert,
flechas/Home/End y recorrido circular del dialogo. Al ampliar a escritorio se
retiran estilos inline de ocultacion y se recupera el foco si la barra movil
desaparece. El cierre tiene 44x44 CSS px en movil. El texto secundario del perfil
pasa de contraste 3.63:1 a 6.91:1 frente a #161922.

Revision mediante ui-ux-pro-max: guia de objetivos tactiles, separacion y foco;
la busqueda especifica del scroll no devolvio una guia pertinente. La solucion
de altura se basa en la reproduccion y en mediciones del DOM, no en ese resultado.
Se conserva el estilo existente.

Cobertura nueva: gestos tactiles emulados de Chromium sobre Datos/Docs/Chat,
320x568, 390x640 y 844x390, cambio a escritorio, teclado y navegacion por siete
modulos con taps sin forzar clics. Se comprueba tambien WebKit con perfiles,
geometria, teclado y navegacion; no equivale a una prueba en un iPhone fisico.
La revision independiente detecto dos regresiones de foco que se corrigieron y
se cubrieron con pruebas que primero fallaron. No se modifico styles.css ni el
trabajo independiente de web-premium.

Verificacion final de esta revision: 205 unitarias y 54 E2E de Chromium
aprobadas, mas 13 comprobaciones de perfil/navegacion/teclado en WebKit.
Incluye nueve escenarios nuevos de interaccion movil. Revision independiente
final sin bloqueantes tras corregir sus observaciones de foco.
