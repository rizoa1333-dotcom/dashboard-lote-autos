'use strict';
const fs = require('node:fs');
const path = require('node:path');

/** Replace the single reviewed npm dependency during image assembly. @param {string} npmRoot @param {string} fixedUndici */
function hardenNpmTransport(npmRoot, fixedUndici) {
  const destination = path.join(npmRoot, 'node_modules/undici');
  for (const [directory, name, version] of [[npmRoot, 'npm', '12.2.1'], [destination, 'undici', '6.29.0'], [fixedUndici, 'undici', '6.29.1']]) {
    const stat = fs.lstatSync(directory);
    const manifest = JSON.parse(fs.readFileSync(path.join(directory, 'package.json'), 'utf8'));
    if (!stat.isDirectory() || stat.isSymbolicLink() || manifest.name !== name || manifest.version !== version) throw new Error('UNREVIEWED_NPM_LAYOUT');
  }
  fs.rmSync(destination, { recursive: true, force: false });
  fs.cpSync(fixedUndici, destination, { recursive: true, dereference: true });
}
if (require.main === module) hardenNpmTransport('/usr/local/lib/node_modules/npm', '/opt/velodrive-npm-security/node_modules/undici');
module.exports = { hardenNpmTransport };
