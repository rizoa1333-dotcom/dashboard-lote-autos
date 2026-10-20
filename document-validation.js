/** Validate a WhatsApp attachment before allocating decoded bytes or writing storage. */
function validateDocument(base64, mimetype, fileLength) {
  const limit = 10 * 1024 * 1024;
  const types = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'application/pdf': 'pdf' };
  const invalid = { ok: false, message: 'El archivo no tiene un formato válido. Envía una imagen JPEG, PNG, WebP o un PDF.' };
  const tooLarge = { ok: false, message: 'El archivo supera el límite de 10 MB. Reduce su tamaño y vuelve a enviarlo.' };
  if (!Object.hasOwn(types, mimetype)) return invalid;
  if (fileLength !== undefined && fileLength !== null) {
    try {
      const length = typeof fileLength === 'object'
        ? (BigInt(fileLength.high >>> 0) << 32n) + BigInt(fileLength.low >>> 0)
        : BigInt(fileLength);
      if (length < 0n) return invalid;
      if (length > BigInt(limit)) return tooLarge;
    } catch { return invalid; }
  }
  if (base64 === null || base64 === undefined) return { ok: true, ext: types[mimetype] };
  if (typeof base64 !== 'string') return invalid;
  if (base64.length > 4 * Math.ceil(limit / 3)) return tooLarge;
  if (!base64.length || base64.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(base64)) return invalid;
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  if ((base64.length / 4) * 3 - padding > limit) return tooLarge;
  const bytes = Buffer.from(base64, 'base64');
  if (bytes.toString('base64') !== base64) return invalid;
  const signatures = {
    'image/jpeg': bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255,
    'image/png': bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
    'image/webp': bytes.length >= 12 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP',
    'application/pdf': bytes.toString('ascii', 0, 5) === '%PDF-'
  };
  if (!signatures[mimetype]) return invalid;
  return { ok: true, ext: types[mimetype], buffer: bytes };
}

module.exports = { validateDocument };
