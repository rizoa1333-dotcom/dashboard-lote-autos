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
