function deriveChannelToken(instance, rootSecret) {
  if (typeof instance !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(instance)
    || typeof rootSecret !== 'string' || rootSecret.length < 32) throw new Error('INVALID_WEBHOOK_CONFIG');
  return require('crypto').createHmac('sha256', rootSecret).update('velodrive-evolution-v1:' + instance).digest('hex');
}

function verifyEvolutionWebhook(input, rootSecret) {
  const token = input?.headers?.['x-velodrive-channel'];
  if (typeof token !== 'string' || !/^[a-f0-9]{64}$/i.test(token)) return false;
  try {
    const expected = deriveChannelToken(input.body?.instance, rootSecret);
    return require('crypto').timingSafeEqual(Buffer.from(token, 'hex'), Buffer.from(expected, 'hex'));
  } catch { return false; }
}

function verifyCitaWebhook(input, secret) {
  const token = input?.headers?.['x-cita-secret'];
  if (typeof token !== 'string' || typeof secret !== 'string' || secret.length < 32) return false;
  const a = Buffer.from(token), b = Buffer.from(secret);
  return a.length === b.length && require('crypto').timingSafeEqual(a, b);
}

function normalizeCitaId(input) {
  const id = input?.body?.cita_id ?? input?.body?.record?.id;
  const value = typeof id === 'string' || (typeof id === 'number' && Number.isSafeInteger(id)) ? String(id) : '';
  if (!/^[1-9][0-9]{0,18}$/.test(value) || BigInt(value) > 9223372036854775807n) throw new Error('INVALID_CITA_ID');
  return value;
}

module.exports = { deriveChannelToken, verifyEvolutionWebhook, verifyCitaWebhook, normalizeCitaId };
