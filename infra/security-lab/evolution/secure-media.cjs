'use strict';
const dns = require('node:dns/promises');
const net = require('node:net');
const { Readable, Transform } = require('node:stream');
const ipaddr = require('ipaddr.js');
const MAX_BYTES = 16 * 1024 * 1024;

/** @param {string} address @returns {boolean} */
function isPublicAddress(address) {
  try {
    const ip = ipaddr.process(address);
    if (ip.range() !== 'unicast') return false;
    return ip.kind() !== 'ipv6' || ip.match(ipaddr.parse('2000::'), 3);
  } catch { return false; }
}

/** @param {string|URL} value @returns {URL} */
function assertPublicMediaUrl(value) {
  let url;
  try {
    const raw = String(value);
    if (raw.length > 8192 || Buffer.byteLength(raw, 'utf8') > 8192) throw new Error('URL_TOO_LONG');
    url = new URL(raw);
  } catch { throw new Error('MEDIA_DESTINATION_REJECTED'); }
  const hostname = url.hostname.replace(/^\[|\]$/g, '');
  if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443') || !hostname || hostname.endsWith('.') || (net.isIP(hostname) && !isPublicAddress(hostname))) {
    throw new Error('MEDIA_DESTINATION_REJECTED');
  }
  return url;
}

/** @param {string|URL} value @returns {URL} */
function assertWhatsAppMediaUrl(value) {
  const url = assertPublicMediaUrl(value);
  const host = url.hostname;
  if (!(host === 'whatsapp.net' || host.endsWith('.whatsapp.net') || host === 'whatsapp.com' || host.endsWith('.whatsapp.com'))) throw new Error('MEDIA_DESTINATION_REJECTED');
  return url;
}

/** @typedef {{headers?: HeadersInit, responseType?: string, dispatcher?: unknown, httpsAgent?: unknown, httpAgent?: unknown, proxy?: unknown, signal?: AbortSignal}} MediaOptions */
/** Dependencies are injectable only for isolated tests, never from HTTP request input. */
function createSecureMediaClient(dependencies = {}) {
  const transport = dependencies.fetch || require('undici').fetch;
  const makeAgent = dependencies.makeAgent || (options => new (require('undici').Agent)(options));
  const lookup = dependencies.lookup || dns.lookup;
  let active = 0;

  function guardedLookup(hostname, options, callback) {
    Promise.resolve().then(() => lookup(hostname, { all: true, verbatim: true, family: options.family || 0 })).then(addresses => {
      if (!Array.isArray(addresses) || !addresses.length || addresses.length > 32 || addresses.some(item => ![4, 6].includes(item.family) || net.isIP(item.address) !== item.family || !isPublicAddress(item.address))) throw new Error('MEDIA_DESTINATION_REJECTED');
      if (options.all) callback(null, addresses);
      else callback(null, addresses[0].address, addresses[0].family);
    }).catch(() => callback(new Error('MEDIA_DESTINATION_REJECTED')));
  }

  /** @param {string|URL} input @param {MediaOptions} options */
  async function download(input, options = {}, liveStream = false) {
    let url = assertPublicMediaUrl(input);
    if (options.dispatcher || options.httpsAgent || options.httpAgent || options.proxy) throw new Error('MEDIA_PROXY_UNSUPPORTED');
    if (active >= 4) throw new Error('MEDIA_DOWNLOAD_CAPACITY');
    active++;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(new Error('MEDIA_TIMEOUT')), 30000);
    timer.unref();
    let agent, body, cleaned = false;
    const cleanup = async () => {
      if (cleaned) return;
      cleaned = true; active--; clearTimeout(timer);
      await agent?.destroy().catch(() => {});
    };
    try {
      agent = makeAgent({ connections: 1, pipelining: 1, connect: { lookup: guardedLookup, timeout: 10000 } });
      const headers = new Headers(options.headers);
      for (const key of ['host', 'connection', 'proxy-authorization', 'proxy-connection', 'transfer-encoding', 'content-length']) headers.delete(key);
      const signal = options.signal ? AbortSignal.any([controller.signal, options.signal]) : controller.signal;
      for (let redirects = 0; ; redirects++) {
        const response = await transport(url, { method: 'GET', headers, redirect: 'manual', dispatcher: agent, signal });
        if ([301, 302, 303, 307, 308].includes(response.status)) {
          await response.body?.cancel().catch(() => {});
          if (redirects >= 5) throw new Error('MEDIA_REDIRECT_LIMIT');
          const location = response.headers.get('location');
          if (!location) throw new Error('MEDIA_DESTINATION_REJECTED');
          const next = assertPublicMediaUrl(new URL(location, url));
          if (next.origin !== url.origin) for (const key of [...headers.keys()]) {
            if (!['accept', 'accept-language', 'origin', 'range', 'user-agent'].includes(key)) headers.delete(key);
          }
          url = next; continue;
        }
        if (!response.ok || !response.body) { await response.body?.cancel().catch(() => {}); throw new Error('MEDIA_HTTP_ERROR'); }
        const length = Number(response.headers.get('content-length'));
        if (Number.isFinite(length) && length > MAX_BYTES) { await response.body.cancel().catch(() => {}); throw new Error('MEDIA_TOO_LARGE'); }
        const source = Readable.fromWeb(response.body);
        let bytes = 0;
        body = new Transform({ transform(chunk, encoding, done) {
          bytes += chunk.length;
          if (bytes > MAX_BYTES) done(new Error('MEDIA_TOO_LARGE'));
          else done(null, chunk);
        } });
        source.on('error', () => body.destroy(new Error(controller.signal.aborted ? 'MEDIA_TIMEOUT' : 'MEDIA_FETCH_FAILED')));
        body.once('error', () => { source.destroy(); controller.abort(); void cleanup(); });
        body.once('close', () => { source.destroy(); controller.abort(); void cleanup(); });
        body.once('end', () => { void cleanup(); });
        source.pipe(body);
        if (liveStream) return { data: body, headers: Object.fromEntries(response.headers), status: response.status };
        const chunks = [];
        for await (const chunk of body) chunks.push(chunk);
        await cleanup();
        const buffer = Buffer.concat(chunks);
        // Vendor audio pipes do not forward transport errors; finish the bounded download first.
        return { data: options.responseType === 'stream' ? Readable.from(buffer) : buffer, headers: Object.fromEntries(response.headers), status: response.status };
      }
    } catch (error) {
      body?.destroy(); controller.abort(); await cleanup();
      if (error instanceof Error && /^MEDIA_[A-Z_]+$/.test(error.message)) throw error;
      throw new Error('MEDIA_FETCH_FAILED');
    }
  }
  return { get: (url, options) => download(url, options), stream: async (url, options) => (await download(url, options, true)).data };
}

let client;
function secureMediaGet(url, options) { client ||= createSecureMediaClient(); return client.get(url, options); }
async function secureMediaStream(url, options) { client ||= createSecureMediaClient(); return client.stream(url, options); }
module.exports = { createSecureMediaClient, assertPublicMediaUrl, assertWhatsAppMediaUrl, isPublicAddress, secureMediaGet, secureMediaStream };
