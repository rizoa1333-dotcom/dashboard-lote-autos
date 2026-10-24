/**
 * Bound Evolution's decoded JSON response in n8n's HTTP transport, before parsing.
 * @param {(options: Record<string, unknown>) => Promise<unknown>} request
 * @param {string} instance
 * @param {string} messageId
 * @param {string} apiKey
 * @returns {Promise<{base64: string}>}
 */
async function downloadDocumentMedia(request, instance, messageId, apiKey) {
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(instance || '')
    || !/^[A-Za-z0-9_-]{1,256}$/.test(messageId || '')
    || typeof apiKey !== 'string' || !apiKey.length) {
    throw new Error('INVALID_DOCUMENT_DOWNLOAD');
  }
  const origin = 'https://evolution-api-production-3652.up.railway.app';
  try {
    const response = await request({
      method: 'POST',
      url: origin + '/chat/getBase64FromMediaMessage/' + instance,
      headers: { apikey: apiKey, Origin: origin },
      body: { message: { key: { id: messageId } }, convertToMp4: false },
      json: true,
      timeout: 15000,
      disableFollowRedirect: true,
      maxResponseBodyBytes: 4 * Math.ceil(10 * 1024 * 1024 / 3) + 65536,
    });
    const base64 = response?.base64 || response?.data;
    if (typeof base64 !== 'string' || !base64.length) throw new Error('INVALID_MEDIA_BODY');
    return { base64 };
  } catch {
    // Provider errors can include request headers and signed media URLs.
    throw new Error('DOCUMENT_DOWNLOAD_FAILED');
  }
}

module.exports = { downloadDocumentMedia };
