'use strict';
const fs = require('node:fs');
const crypto = require('node:crypto');
function verify(source, expected) {
  if (crypto.createHash('sha256').update(source).digest('hex') !== expected) throw new Error('UNEXPECTED_MEDIA_SOURCE');
}
function replaceOnce(source, from, to) {
  if (source.split(from).length !== 2) throw new Error('MEDIA_CONSUMER_DRIFT');
  return source.replace(from, to);
}

function rewriteDirectMediaCalls(source) {
  let count = 0;
  const direct = /(\$t|wt|Wt|xe|sr)\.default\.get\(([\w$]+(?:\.[\w$]+)*),\{((?:headers:\{Authorization:`Bearer \$\{this.token\}`\},)?responseType:"arraybuffer")\}\)/g;
  return { source: source.replace(direct, (match, alias, url, options) => { count++; return `VeloDriveMedia.secureMediaGet(${url},{${options}})`; }), count };
}

/** @param {string} source @returns {string} */
function hardenBaileysMedia(source) {
  verify(source, '22730bc93f1728e6b5866f8d50af67cdcaff6e23a1260450ac7b4bd082e187c0');
  const from = `export const getHttpStream = async (url, options = {}) => {
    const response = await fetch(url.toString(), {
        dispatcher: options.dispatcher,
        method: 'GET',
        headers: options.headers
    });
    if (!response.ok) {
        throw new Boom(\`Failed to fetch stream from \${url}\`, { statusCode: response.status, data: { url } });
    }
    // @ts-ignore Node18+ Readable.fromWeb exists
    return response.body instanceof Readable ? response.body : Readable.fromWeb(response.body);
};`;
  let result = replaceOnce(source, from, 'export const getHttpStream = async (url, options = {}) => VeloDriveMedia.secureMediaStream(url, options);');
  const anchor = '    const downloadUrl = directPath ? getUrlFromDirectPath(directPath, fallbackHost) : url;';
  result = replaceOnce(result, anchor, anchor + '\n    VeloDriveMedia.assertWhatsAppMediaUrl(downloadUrl);');
  result = replaceOnce(result, '    return fetched.pipe(output, { end: true });',
    "    fetched.once('error', error => output.destroy(error));\n    output.once('error', () => fetched.destroy());\n    output.once('close', () => fetched.destroy());\n    return fetched.pipe(output, { end: true });");
  return "import VeloDriveMedia from '/evolution/security/secure-media.cjs';\n" + result;
}

/** @param {string} source @returns {string} */
function hardenEvolutionMedia(source) {
  verify(source, '71b49ea87b8d0d7b413b77d067e33a8720c2e95e136f632210c1424862ef6b44');
  let result = source;
  for (const [arguments_, copies] of [
    ['e.media,c', 1], ['e.media,a', 1], ['r,a', 1],
    ['e,{responseType:"stream"}', 1], ['a,c', 1], ['n,r', 2],
  ]) {
    const from = `ke.default.get(${arguments_})`;
    if (result.split(from).length !== copies + 1) throw new Error('MEDIA_CONSUMER_DRIFT');
    result = result.replaceAll(from, `VeloDriveMedia.secureMediaGet(${arguments_})`);
  }
  const direct = rewriteDirectMediaCalls(result);
  result = direct.source;
  const count = direct.count;
  if (count !== 10) throw new Error('MEDIA_CONSUMER_DRIFT');
  return 'const VeloDriveMedia=require("../security/secure-media.cjs");\n' + result;
}

if (require.main === module) {
  const baileys = '/evolution/node_modules/baileys/lib/Utils/messages-media.js';
  const evolution = '/evolution/dist/main.js';
  const updatedBaileys = hardenBaileysMedia(fs.readFileSync(baileys, 'utf8'));
  const updatedEvolution = hardenEvolutionMedia(fs.readFileSync(evolution, 'utf8'));
  fs.writeFileSync(baileys, updatedBaileys);
  fs.writeFileSync(evolution, updatedEvolution);
}
module.exports = { hardenBaileysMedia, hardenEvolutionMedia, rewriteDirectMediaCalls };
