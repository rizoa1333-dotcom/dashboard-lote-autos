'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const zlib = require('node:zlib');
const { validateManifest, reconstruct, verifyFilesystem, assertBuildInvocation } = require('../../infra/security-lab/evolution/reconstruct-filesystem.cjs');

const sha = value => crypto.createHash('sha256').update(value).digest('hex');
const rowsDigest = rows => sha(rows.map(row => JSON.stringify(row) + '\n').join(''));
function fixture() {
  const rows = [['/', 0o40755, 0, 0], ['/app', 0o40755, 1000, 1000], ['/app/data', 0o100640, 1000, 1000, 3, sha('abc')]];
  return { version: 1, productionData: false, rows, sources: { '/app/data': { kind: 'payload' } },
    payload: [{ path: '/app/data', bytes: 3, sha256: sha('abc') }], payloadBytes: 3,
    payloadSha256: sha(zlib.gzipSync('abc')), expectedDigest: rowsDigest(rows) };
}
function redigest(manifest) { manifest.expectedDigest = rowsDigest(manifest.rows); return manifest; }

test('BuildKit invocation uses explicit build paths without relying on a Docker marker file', () => {
  assert.equal(typeof assertBuildInvocation, 'function');
  assert.doesNotThrow(() => assertBuildInvocation('linux', '1', ['construct', '/tmp/vd-reconstruct/manifest.json', '/tmp/vd-reconstruct/payload.bin.gz', '/vd-root']));
  assert.doesNotThrow(() => assertBuildInvocation('linux', '1', ['verify', '/tmp/vd-verify/manifest.json']));
});
test('build invocation rejects a different platform, flag, input path, output root or extra argument', () => {
  const valid = ['construct', '/tmp/vd-reconstruct/manifest.json', '/tmp/vd-reconstruct/payload.bin.gz', '/vd-root'];
  for (const [platform, flag, args] of [['win32', '1', valid], ['linux', '', valid], ['linux', '1', ['construct', '/etc/shadow', valid[2], valid[3]]],
    ['linux', '1', [...valid.slice(0,3), '/']], ['linux', '1', [...valid, 'extra']], ['linux', '1', ['verify', '/etc/shadow']]]) {
    assert.throws(() => assertBuildInvocation(platform, flag, args), /BUILD_INVOCATION_REQUIRED/);
  }
});

test('reconstruction accepts a bounded manifest with its exact digest', () => {
  assert.equal(validateManifest(fixture()).rows.size, 3);
});
test('reconstruction rejects traversal, backslashes and runtime mount entries', () => {
  for (const unsafe of ['/app/../etc', '/app\\etc', '/proc/file', '/etc/hosts', '/tmp/file']) {
    const m = fixture(); m.rows[2][0] = unsafe;
    assert.throws(() => validateManifest(redigest(m)), /PATH/);
  }
});
test('reconstruction rejects duplicate paths and a parent represented by a symlink', () => {
  const duplicate = fixture(); duplicate.rows.push(duplicate.rows[2]);
  assert.throws(() => validateManifest(redigest(duplicate)), /DUPLICATE/);
  const symlink = fixture(); symlink.rows[1] = ['/app', 0o120777, 0, 0, '/elsewhere'];
  assert.throws(() => validateManifest(redigest(symlink)), /PARENT/);
});
test('reconstruction rejects an incorrect digest, unknown type and excess declared bytes', () => {
  const m = fixture(); m.expectedDigest = '0'.repeat(64);
  assert.throws(() => validateManifest(m), /DIGEST/);
  const special = fixture(); special.rows[2][1] = 0o20666;
  assert.throws(() => validateManifest(redigest(special)), /TYPE/);
  const large = fixture(); large.rows[2][4] = 2 ** 33;
  assert.throws(() => validateManifest(redigest(large)), /LIMIT/);
});
test('reconstruction requires exactly one valid source and matching payload segment per file', () => {
  for (const change of [m => delete m.sources['/app/data'], m => { m.sources['/app/data'].kind = 'remote'; },
    m => { m.payload[0].bytes = 2; }, m => m.payload.push(m.payload[0]),
    m => { m.sources['/app/data'] = { kind: 'vendor', path: '/../secret' }; }]) {
    const m = fixture(); change(m); assert.throws(() => validateManifest(m));
  }
});
test('reconstruction rejects hardlink cycles and conflicting inode metadata', () => {
  const m = fixture(); m.rows.push(['/app/other', ...m.rows[2].slice(1)]);
  m.sources['/app/data'] = { kind: 'link', path: '/app/other' };
  m.sources['/app/other'] = { kind: 'link', path: '/app/data' };
  m.payload = []; m.payloadBytes = 0;
  assert.throws(() => validateManifest(redigest(m)), /CYCLE/);
  m.sources['/app/data'] = { kind: 'payload' }; m.payload = fixture().payload; m.payloadBytes = 3;
  m.rows[3][2] = 999;
  assert.throws(() => validateManifest(redigest(m)), /LINK_METADATA/);
});

test('reconstruction refuses an existing output directory before writing', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vd-reconstruct-test-'));
  try { await assert.rejects(reconstruct(fixture(), { output: root, payload: 'unused', vendorRoot: root, nodeRoot: root }), /OUTPUT_EXISTS/); }
  finally { fs.rmdirSync(root); }
});

test('Linux reconstruction verifies payload, ownership, hardlinks and rejects extra files', { skip: process.platform !== 'linux' || process.getuid() !== 0 }, async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'vd-reconstruct-test-'));
  const output = path.join(temp, 'output'), payload = path.join(temp, 'payload.gz');
  const m = fixture();
  m.rows.push(['/app/link', 0o120777, 1000, 1000, '/app/data'], ['/app/other', ...m.rows[2].slice(1)]);
  m.sources['/app/other'] = { kind: 'link', path: '/app/data' }; redigest(m);
  fs.writeFileSync(payload, zlib.gzipSync('abc'));
  try {
    await reconstruct(m, { output, payload, vendorRoot: temp, nodeRoot: temp });
    assert.equal(fs.readFileSync(path.join(output, 'app/data'), 'utf8'), 'abc');
    assert.equal(fs.lstatSync(path.join(output, 'app/data')).uid, 1000);
    assert.equal(fs.statSync(path.join(output, 'app/data')).ino, fs.statSync(path.join(output, 'app/other')).ino);
    assert.equal(fs.readlinkSync(path.join(output, 'app/link')), '/app/data');
    assert.equal(fs.statSync(path.join(output, 'tmp')).mode & 0o7777, 0o1777);
    assert.equal(verifyFilesystem(m, output).digest, m.expectedDigest);
    fs.chmodSync(path.join(output, 'tmp'), 0o1755);
    assert.throws(() => verifyFilesystem(m, output), /FILESYSTEM_TMP/);
    fs.chmodSync(path.join(output, 'tmp'), 0o1777);
    fs.writeFileSync(path.join(output, 'extra'), 'unexpected');
    assert.throws(() => verifyFilesystem(m, output), /FILESYSTEM/);
  } finally { fs.rmSync(temp, { recursive: true, force: true }); }
});

test('Linux reconstruction rejects corrupt payload, excess decompression and a linked base parent', { skip: process.platform !== 'linux' || process.getuid() !== 0 }, async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'vd-reconstruct-test-'));
  try {
    const payload = path.join(temp, 'payload.gz'); fs.writeFileSync(payload, zlib.gzipSync('abd'));
    await assert.rejects(reconstruct(fixture(), { output: path.join(temp, 'bad-hash'), payload, vendorRoot: temp, nodeRoot: temp }), /PAYLOAD_HASH/);
    const m = fixture(); m.payloadSha256 = sha(zlib.gzipSync('abcd')); fs.writeFileSync(payload, zlib.gzipSync('abcd'));
    await assert.rejects(reconstruct(m, { output: path.join(temp, 'too-long'), payload, vendorRoot: temp, nodeRoot: temp }), /PAYLOAD_(LENGTH|FILE_HASH)/);
    const base = path.join(temp, 'base'); fs.mkdirSync(base); fs.symlinkSync('/etc', path.join(base, 'linked'));
    const linked = fixture(); linked.sources['/app/data'] = { kind: 'vendor', path: '/linked/passwd' }; linked.payload = []; linked.payloadBytes = 0;
    linked.payloadSha256 = sha(zlib.gzipSync('')); fs.writeFileSync(payload, zlib.gzipSync(''));
    await assert.rejects(reconstruct(linked, { output: path.join(temp, 'linked-output'), payload, vendorRoot: base, nodeRoot: temp }), /BASE_SYMLINK/);
  } finally { fs.rmSync(temp, { recursive: true, force: true }); }
});
