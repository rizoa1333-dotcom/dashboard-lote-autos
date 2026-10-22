'use strict';
/** Classify the upstream response without forwarding provider payloads or secrets.
 * @param {unknown} response
 * @param {string} requestId
 * @returns {{accepted:boolean,request_id:string,httpStatus:number,providerHttpStatus:number,code:string,error:string}}
 */
function evaluatePublicationResponse(response, requestId) {
  const envelope = response && typeof response === 'object' ? response : {};
  const rawStatus = Number(envelope.statusCode ?? 200);
  const status = Number.isInteger(rawStatus) && rawStatus >= 100 && rawStatus <= 599 ? rawStatus : 0;
  const result = envelope.body ?? envelope;
  const accepted = status >= 200 && status < 300 && result?.success === true && result.request_id === requestId;
  const failures = {
    400: ['UPLOAD_POST_INVALID_REQUEST', 'Upload-Post rechazó los datos de la publicación. Revisa las fotos, el texto y las cuentas seleccionadas.'],
    401: ['UPLOAD_POST_AUTH_FAILED', 'La integración de publicaciones no pudo autenticarse. Contacta a soporte para revisar la credencial de Upload-Post.'],
    403: ['UPLOAD_POST_PLAN_RESTRICTED', 'Upload-Post no permite esta operación con los permisos o el plan actuales. Contacta a soporte.'],
    404: ['UPLOAD_POST_PROFILE_NOT_FOUND', 'Upload-Post no encontró el perfil del lote. Revisa la conexión de Facebook e Instagram.'],
    429: ['UPLOAD_POST_LIMIT_REACHED', 'Upload-Post alcanzó un límite de publicaciones. Revisa la cuota disponible antes de reintentar.'],
  };
  const [code, error] = accepted ? ['UPLOAD_POST_ACCEPTED', ''] : failures[status] || [
    'UPLOAD_POST_UNCONFIRMED',
    'No se confirmó el envío. Verifica el estado antes de reintentar; se conservará el identificador para evitar duplicados.',
  ];
  return {accepted,request_id:requestId,httpStatus:accepted ? 200 : 502,providerHttpStatus:status,code,error};
}
/** Return only public status fields; provider results can contain account data and captions.
 * @param {Record<string, any>} response
 */
function evaluatePublicationStatus(response) {
  const status = typeof response.status === 'string' ? response.status : 'unknown';
  const raw = response.results || [];
  const results = Array.isArray(raw) ? raw : Object.entries(raw).map(([platform, value]) => ({...value, platform}));
  const relevant = results.filter(result => ['facebook', 'instagram'].includes(result.platform));
  const detalle = relevant.map(result => ({
    platform: result.platform,
    success: result.success === true && result.skipped !== true && result.status !== 'failed',
    failed: result.success === false || result.skipped === true || result.status === 'failed',
    code: result.platform === 'facebook' && result.error_code === 'config_target_missing' ? 'FACEBOOK_PAGE_REQUIRED' : '',
  }));
  const completado = status === 'completed';
  const fallo = status === 'failed' || detalle.some(result => result.failed);
  const expected = Number(response.total || detalle.length);
  const publicado = completado && !fallo && expected > 0 && detalle.length >= expected && detalle.every(result => result.success);
  const parcial = detalle.some(result => result.success) && detalle.some(result => result.failed);
  const mensaje = detalle.map(result => {
    const name = result.platform === 'facebook' ? 'Facebook' : 'Instagram';
    if (result.success) return name + ': publicado';
    if (result.code === 'FACEBOOK_PAGE_REQUIRED') return name + ': selecciona o autoriza una Página del negocio';
    return name + (result.failed ? ': falló; revisa la conexión de esa cuenta' : ': en proceso');
  }).join('. ');
  return {status, completado, fallo, publicado, parcial, detalle, mensaje};
}
module.exports = { evaluatePublicationResponse, evaluatePublicationStatus };
