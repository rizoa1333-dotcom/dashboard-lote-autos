const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { hardenNpmTransport } = require('../../infra/security-lab/evolution/harden-npm.cjs');

function fixture() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'evolution-npm-'));
  const npm = path.join(directory, 'npm');
  const overlay = path.join(directory, 'overlay');
  for (const [folder, name, version] of [[npm, 'npm', '12.2.1'], [path.join(npm, 'node_modules/undici'), 'undici', '6.29.0'], [overlay, 'undici', '6.29.1']]) {
    fs.mkdirSync(folder, { recursive: true });
    fs.writeFileSync(path.join(folder, 'package.json'), JSON.stringify({ name, version }));
  }
  fs.writeFileSync(path.join(npm, 'node_modules/undici/index.js'), 'old transport');
  fs.writeFileSync(path.join(overlay, 'index.js'), 'fixed transport');
  fs.writeFileSync(path.join(npm, 'untouched'), 'preserved');
  return { directory, npm, overlay };
}

test('npm overlay replaces only the reviewed Undici consumer', () => {
  const f = fixture();
  try {
    hardenNpmTransport(f.npm, f.overlay);
    assert.equal(fs.readFileSync(path.join(f.npm, 'node_modules/undici/index.js'), 'utf8'), 'fixed transport');
    assert.equal(fs.readFileSync(path.join(f.npm, 'untouched'), 'utf8'), 'preserved');
    assert.equal(JSON.parse(fs.readFileSync(path.join(f.npm, 'node_modules/undici/package.json'))).version, '6.29.1');
  } finally { fs.rmSync(f.directory, { recursive: true, force: true }); }
});

test('npm overlay refuses upstream layout or version changes before replacing files', () => {
  for (const [target, version] of [['npm', '12.2.2'], ['old', '7.0.0'], ['overlay', '6.29.0']]) {
    const f = fixture();
    try {
      const file = path.join(target === 'npm' ? f.npm : target === 'old' ? path.join(f.npm, 'node_modules/undici') : f.overlay, 'package.json');
      const manifest = JSON.parse(fs.readFileSync(file)); manifest.version = version;
      fs.writeFileSync(file, JSON.stringify(manifest));
      assert.throws(() => hardenNpmTransport(f.npm, f.overlay), /UNREVIEWED_NPM/);
      assert.equal(fs.readFileSync(path.join(f.npm, 'node_modules/undici/index.js'), 'utf8'), 'old transport');
    } finally { fs.rmSync(f.directory, { recursive: true, force: true }); }
  }
});
