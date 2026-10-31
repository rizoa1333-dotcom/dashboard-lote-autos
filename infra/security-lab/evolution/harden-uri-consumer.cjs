'use strict';
const fs = require('node:fs');
const crypto = require('node:crypto');

/** @param {string} source @param {string} version @returns {string} */
function patchQueryString(source, version) {
  const anchor = "const decodeComponent = require('decode-uri-component');";
  if (version !== '7.1.3' || source.split(anchor).length !== 2) throw new Error('URI_CONSUMER_DRIFT');
  return source.replace(anchor, "const decodeComponent = require('decode-uri-component').default;");
}

if (require.main === module) {
  const root = '/evolution/node_modules', filename = root + '/query-string/index.js';
  const source = fs.readFileSync(filename, 'utf8');
  const consumer = JSON.parse(fs.readFileSync(root + '/query-string/package.json', 'utf8'));
  const decoder = JSON.parse(fs.readFileSync(root + '/decode-uri-component/package.json', 'utf8'));
  if (decoder.version !== '0.5.1' || decoder.type !== 'module' ||
      crypto.createHash('sha256').update(source).digest('hex') !== 'caa3f2c8b45dfe1e91db22ae10743af68de8d96f26515132bb52485ec0f037fa') throw new Error('URI_CONSUMER_DRIFT');
  fs.writeFileSync(filename, patchQueryString(source, consumer.version));
}

module.exports = { patchQueryString };
