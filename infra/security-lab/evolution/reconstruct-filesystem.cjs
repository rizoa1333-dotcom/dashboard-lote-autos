'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const { Writable } = require('node:stream');
const { pipeline } = require('node:stream/promises');

/** @typedef {[string, number, number, number, ...Array<string|number>]} Row */
/** @typedef {{kind: 'vendor'|'node'|'payload'|'link', path?: string}} Source */
/** @typedef {{path: string, bytes: number, sha256: string}} Segment */
/** @typedef {{version: number, productionData: boolean, rows: Row[], sources: Record<string,Source>, payload: Segment[], payloadBytes: number, payloadSha256: string, expectedDigest: string}} Manifest */

const MAX_ENTRIES = 100000, MAX_FILE = 1024 ** 3, MAX_TOTAL = 4 * 1024 ** 3;
const EXCLUDED = new Set(['/proc', '/sys', '/dev', '/run', '/tmp', '/etc/hosts', '/etc/hostname', '/etc/resolv.conf', '/.dockerenv']);
const MOUNTS = ['/proc', '/sys', '/dev', '/run', '/tmp'];
const HASH = /^[a-f0-9]{64}$/;
const fail = code => { throw new Error(code); };
const digestRows = rows => {
  const hash = crypto.createHash('sha256');
  for (const row of rows) hash.update(JSON.stringify(row) + '\n');
  return hash.digest('hex');
};
const fileType = row => row[1] & 0o170000;
const excluded = name => EXCLUDED.has(name) || MOUNTS.some(root => name.startsWith(root + '/'));

/** @param {unknown} value @returns {string} */
function safePath(value) {
  if (typeof value !== 'string' || !value.startsWith('/') || value.includes('\0') || value.includes('\\') ||
      path.posix.normalize(value) !== value || (value !== '/' && value.endsWith('/')) ||
      value.split('/').length > 128 || value.length > 4096 || excluded(value)) fail('MANIFEST_PATH');
  return value;
}
const integer = (value, max) => Number.isSafeInteger(value) && value >= 0 && value <= max;

/** Validate the entire graph before any filesystem writes. @param {Manifest} manifest */
function validateManifest(manifest) {
  if (!manifest || manifest.version !== 1 || manifest.productionData !== false || !Array.isArray(manifest.rows) ||
      manifest.rows.length < 1 || manifest.rows.length > MAX_ENTRIES || !manifest.sources ||
      typeof manifest.sources !== 'object' || Array.isArray(manifest.sources) || !Array.isArray(manifest.payload) ||
      manifest.payload.length > MAX_ENTRIES || !integer(manifest.payloadBytes, MAX_TOTAL) ||
      !HASH.test(manifest.payloadSha256) || !HASH.test(manifest.expectedDigest)) fail('MANIFEST_LIMIT_OR_SHAPE');
  /** @type {Map<string, Row>} */
  const rows = new Map();
  let total = 0;
  for (const row of manifest.rows) {
    if (!Array.isArray(row) || row.length < 4) fail('MANIFEST_ROW');
    const name = safePath(row[0]);
    if (rows.has(name)) fail('MANIFEST_DUPLICATE');
    if (!integer(row[1], 0o177777) || !integer(row[2], 2 ** 32 - 2) || !integer(row[3], 2 ** 32 - 2)) fail('MANIFEST_METADATA');
    const type = fileType(row);
    if (type === 0o100000) {
      if (row.length !== 6 || !integer(row[4], MAX_FILE) || !HASH.test(row[5])) fail('MANIFEST_FILE_LIMIT');
      total += row[4]; if (total > MAX_TOTAL) fail('MANIFEST_TOTAL_LIMIT');
    } else if (type === 0o40000) {
      if (row.length !== 4) fail('MANIFEST_DIRECTORY');
    } else if (type === 0o120000) {
      if (row.length !== 5 || typeof row[4] !== 'string' || !row[4] || row[4].includes('\0') || row[4].length > 4096) fail('MANIFEST_SYMLINK');
    } else fail('MANIFEST_TYPE');
    rows.set(name, row);
  }
  if (!rows.has('/') || fileType(rows.get('/')) !== 0o40000) fail('MANIFEST_ROOT');
  for (const [name] of rows) {
    if (name !== '/' && fileType(rows.get(path.posix.dirname(name)) || []) !== 0o40000) fail('MANIFEST_PARENT');
  }
  if (digestRows(manifest.rows) !== manifest.expectedDigest) fail('MANIFEST_DIGEST');
  const segments = new Set(); let payloadTotal = 0;
  for (const segment of manifest.payload) {
    if (!segment || typeof segment !== 'object') fail('MANIFEST_SEGMENT');
    const name = safePath(segment.path), row = rows.get(name);
    if (segments.has(name) || !row || fileType(row) !== 0o100000 || segment.bytes !== row[4] || segment.sha256 !== row[5]) fail('MANIFEST_SEGMENT');
    segments.add(name); payloadTotal += segment.bytes;
  }
  if (payloadTotal !== manifest.payloadBytes) fail('MANIFEST_PAYLOAD_LENGTH');
  const regular = [...rows.values()].filter(row => fileType(row) === 0o100000);
  if (Object.keys(manifest.sources).length !== regular.length) fail('MANIFEST_SOURCE_COUNT');
  for (const row of regular) {
    const source = Object.hasOwn(manifest.sources, row[0]) && manifest.sources[row[0]];
    if (!source || typeof source !== 'object' || !['vendor', 'node', 'payload', 'link'].includes(source.kind)) fail('MANIFEST_SOURCE');
    if (source.kind !== 'payload') safePath(source.path);
    if ((source.kind === 'payload') !== segments.has(row[0])) fail('MANIFEST_SOURCE_PAYLOAD');
    if (source.kind === 'link') {
      const reference = rows.get(source.path);
      if (!reference || JSON.stringify(row.slice(1)) !== JSON.stringify(reference.slice(1))) fail('MANIFEST_LINK_METADATA');
    }
  }
  const resolved = new Set();
  for (const row of regular) {
    const chain = new Set(); let name = row[0];
    while (!resolved.has(name)) {
      if (chain.has(name)) fail('MANIFEST_LINK_CYCLE');
      chain.add(name);
      const source = manifest.sources[name];
      if (source.kind !== 'link') break;
      name = source.path;
    }
    for (const item of chain) resolved.add(item);
  }
  return { rows, regular, totalBytes: total };
}

/** @param {string} filename @param {number} [maxBytes] */
function hashFile(filename, maxBytes = MAX_FILE) {
  const size = fs.lstatSync(filename).size;
  if (size > maxBytes) fail('FILE_LIMIT');
  const hash = crypto.createHash('sha256'), buffer = Buffer.allocUnsafe(1024 * 1024);
  const fd = fs.openSync(filename, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
  let bytes = 0;
  try {
    let n;
    while ((n = fs.readSync(fd, buffer, 0, buffer.length, null)) > 0) { bytes += n; if (bytes > maxBytes) fail('FILE_LIMIT'); hash.update(buffer.subarray(0, n)); }
  } finally { fs.closeSync(fd); }
  if (bytes !== size) fail('FILE_CHANGED');
  return hash.digest('hex');
}

function rooted(root, name) { return name === '/' ? root : path.join(root, name.slice(1)); }
function baseFile(root, name) {
  if (!path.isAbsolute(root)) fail('BASE_ROOT');
  let current = root;
  if (!fs.lstatSync(root).isDirectory() || fs.lstatSync(root).isSymbolicLink()) fail('BASE_SYMLINK');
  const parts = name.slice(1).split('/');
  for (let i = 0; i < parts.length; i++) {
    current = path.join(current, parts[i]); const stat = fs.lstatSync(current);
    if (stat.isSymbolicLink()) fail('BASE_SYMLINK');
    if (i === parts.length - 1 ? !stat.isFile() : !stat.isDirectory()) fail('BASE_TYPE');
  }
  return current;
}

/** @param {Manifest} manifest @param {string} root */
function applyMetadata(manifest, root) {
  const directories = [];
  for (const row of manifest.rows) {
    const target = rooted(root, row[0]), type = fileType(row);
    if (type === 0o40000) { directories.push(row); continue; }
    fs.lchownSync(target, row[2], row[3]);
    if (type !== 0o120000) fs.chmodSync(target, row[1] & 0o7777);
  }
  directories.sort((a, b) => b[0].length - a[0].length);
  for (const row of directories) { const target = rooted(root, row[0]); fs.chownSync(target, row[2], row[3]); fs.chmodSync(target, row[1] & 0o7777); }
}

/** @param {Manifest} manifest @param {string} root */
function verifyFilesystem(manifest, root) {
  validateManifest(manifest);
  const temporary = fs.lstatSync(rooted(root, '/tmp'));
  if (!temporary.isDirectory() || temporary.isSymbolicLink() || temporary.uid !== 0 || temporary.gid !== 0 || (temporary.mode & 0o7777) !== 0o1777) fail('FILESYSTEM_TMP');
  const rows = [];
  function walk(name) {
    if (excluded(name)) return;
    const full = rooted(root, name), stat = fs.lstatSync(full);
    const row = [name, stat.mode, stat.uid, stat.gid];
    if (stat.isFile()) row.push(stat.size, hashFile(full));
    else if (stat.isSymbolicLink()) row.push(fs.readlinkSync(full));
    else if (!stat.isDirectory()) fail('FILESYSTEM_SPECIAL');
    rows.push(row);
    if (stat.isDirectory()) for (const child of fs.readdirSync(full).sort()) walk(name === '/' ? '/' + child : name + '/' + child);
  }
  walk('/');
  const digest = digestRows(rows);
  if (rows.length !== manifest.rows.length || digest !== manifest.expectedDigest) fail('FILESYSTEM_MISMATCH');
  for (const [name, source] of Object.entries(manifest.sources)) {
    if (source.kind === 'link') {
      const a = fs.statSync(rooted(root, name)), b = fs.statSync(rooted(root, source.path));
      if (a.ino !== b.ino || a.dev !== b.dev) fail('FILESYSTEM_HARDLINK');
    }
  }
  return { entries: rows.length, digest };
}

/** @param {Manifest} manifest @param {{output:string,payload:string,vendorRoot:string,nodeRoot:string}} options */
async function reconstruct(manifest, options) {
  const { output, payload, vendorRoot, nodeRoot } = options;
  if (fs.existsSync(output)) fail('OUTPUT_EXISTS');
  if (process.platform !== 'linux' || process.getuid() !== 0 || !path.isAbsolute(output) || output === '/') fail('OUTPUT_PLATFORM_OR_ROOT');
  const { regular } = validateManifest(manifest);
  if (hashFile(payload) !== manifest.payloadSha256) fail('PAYLOAD_HASH');
  fs.mkdirSync(output, { mode: 0o700 });
  const directories = manifest.rows.filter(row => fileType(row) === 0o40000 && row[0] !== '/').sort((a, b) => a[0].length - b[0].length);
  for (const row of directories) fs.mkdirSync(rooted(output, row[0]), { mode: 0o700 });
  for (const row of regular) {
    const source = manifest.sources[row[0]];
    if (source.kind === 'vendor' || source.kind === 'node') {
      const input = baseFile(source.kind === 'vendor' ? vendorRoot : nodeRoot, source.path);
      if (fs.statSync(input).size !== row[4] || hashFile(input) !== row[5]) fail('BASE_FILE_HASH');
      fs.copyFileSync(input, rooted(output, row[0]), fs.constants.COPYFILE_EXCL);
    }
  }
  let segmentIndex = 0, fd = null, remaining = 0, hash = null, decoded = 0;
  function openSegment() {
    while (segmentIndex < manifest.payload.length && fd === null) {
      const segment = manifest.payload[segmentIndex]; remaining = segment.bytes;
      hash = crypto.createHash('sha256'); fd = fs.openSync(rooted(output, segment.path), 'wx', 0o600);
      if (remaining === 0) closeSegment();
    }
  }
  function closeSegment() {
    fs.closeSync(fd); fd = null;
    if (hash.digest('hex') !== manifest.payload[segmentIndex].sha256) fail('PAYLOAD_FILE_HASH');
    segmentIndex++;
  }
  try {
    openSegment();
    const sink = new Writable({ write(chunk, _encoding, callback) {
      try {
        decoded += chunk.length; if (decoded > manifest.payloadBytes) fail('PAYLOAD_LENGTH');
        let offset = 0;
        while (offset < chunk.length) {
          if (fd === null) fail('PAYLOAD_LENGTH');
          const count = Math.min(remaining, chunk.length - offset), part = chunk.subarray(offset, offset + count);
          let written = 0; while (written < part.length) written += fs.writeSync(fd, part, written, part.length - written);
          hash.update(part); remaining -= count; offset += count;
          if (remaining === 0) { closeSegment(); openSegment(); }
        }
        callback();
      } catch (error) { callback(error); }
    } });
    await pipeline(fs.createReadStream(payload), zlib.createGunzip(), sink);
    if (decoded !== manifest.payloadBytes || segmentIndex !== manifest.payload.length || fd !== null) fail('PAYLOAD_LENGTH');
  } finally { if (fd !== null) fs.closeSync(fd); }
  const links = regular.filter(row => manifest.sources[row[0]].kind === 'link');
  const linked = new Set();
  for (const row of links) {
    const chain = []; let name = row[0];
    while (manifest.sources[name].kind === 'link' && !linked.has(name)) { chain.push(name); name = manifest.sources[name].path; }
    for (let i = chain.length - 1; i >= 0; i--) {
      const item = chain[i]; fs.linkSync(rooted(output, manifest.sources[item].path), rooted(output, item)); linked.add(item);
    }
  }
  for (const row of manifest.rows) if (fileType(row) === 0o120000) fs.symlinkSync(row[4], rooted(output, row[0]));
  for (const mount of MOUNTS) {
    const target = rooted(output, mount), mode = mount === '/tmp' ? 0o1777 : 0o755;
    fs.mkdirSync(target, { mode });
    // mkdir applies the builder umask; /tmp must remain writable for UID 1000.
    fs.chmodSync(target, mode);
  }
  applyMetadata(manifest, output);
  return verifyFilesystem(manifest, output);
}

module.exports = { validateManifest, reconstruct, verifyFilesystem };

if (require.main === module) {
  (async () => {
    if (process.platform !== 'linux' || !fs.existsSync('/.dockerenv') || process.env.VELODRIVE_RECONSTRUCTION_BUILD !== '1') fail('BUILD_CONTAINER_REQUIRED');
    const [operation, manifestFile, payload, output = '/vd-root'] = process.argv.slice(2);
    if (!manifestFile || fs.statSync(manifestFile).size > 64 * 1024 ** 2) fail('MANIFEST_INPUT_LIMIT');
    const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
    const result = operation === 'construct'
      ? await reconstruct(manifest, { output, payload, vendorRoot: '/vd-base', nodeRoot: '/' })
      : operation === 'verify' ? verifyFilesystem(manifest, '/') : fail('BUILD_OPERATION');
    console.log(JSON.stringify({ operation, ...result, productionData: false }));
  })().catch(error => { console.error(error.message); process.exitCode = 1; });
}
