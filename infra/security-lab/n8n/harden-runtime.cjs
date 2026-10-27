const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const GIT_SOURCE_SHA256 = '4f83e5249d7d69e796e2cc1ccf55d732ee429e14041623e4c55207693474eb44';
const SOURCE_CONTROL_SHA256 = '69400823fe736395e4a7f5d7900156ff227bd1efcc0db7317f130369cfa5d155';
const PROMOTIONS_SHA256 = '6ed0d413363b14b72e45eb6444ed797ffe72f0e77a0a1a8ba04c7de328fb3922';
const VERSION_PINS = Object.freeze({ 'simple-git': '4.0.2', handlebars: '4.7.10', '@simple-git/argv-parser': '2.0.1' });

function adaptGitNode(source) {
  const previousImport = 'const simple_git_1 = __importDefault(require("simple-git"));';
  const previousCall = 'simple_git_1.default';
  if (source.split(previousImport).length !== 2 || source.split(previousCall).length !== 2) {
    throw new Error('GIT_CONSUMER_DRIFT');
  }
  const call = '(0, simple_git_1.default)(gitOptions).env(cleanEnv)';
  if (source.split(call).length !== 2) throw new Error('GIT_CONSUMER_DRIFT');
  return source.replace(previousImport, 'const simple_git_1 = require("simple-git");')
    .replace(call, "(0, simple_git_1.simpleGit)({ ...gitOptions, allowEnvironment: ['GIT_TERMINAL_PROMPT', 'GIT_ALLOW_PROTOCOL'] }).env(cleanEnv)");
}

function adaptOptions(source, marker) {
  if (source.split(marker).length !== 2) throw new Error('GIT_CONSUMER_DRIFT');
  return source.replace(marker, `${marker}\n            allowEnvironment: ['GIT_TERMINAL_PROMPT', 'GIT_SSH_COMMAND', 'N8N_GIT_USERNAME', 'N8N_GIT_PASSWORD'],`);
}

function adaptSourceControl(source) { return adaptOptions(source, 'this.gitOptions = {\n'); }
function adaptPromotions(source) { return adaptOptions(source, 'const BASE_GIT_OPTIONS = {\n'); }

function verifyOverlayManifest(manifest) {
  for (const [name, version] of Object.entries(VERSION_PINS)) {
    if (manifest.dependencies?.[name] !== version) throw new Error(`OVERLAY_VERSION: ${name}`);
  }
  return true;
}

function hardenRuntime(root, overlay) {
  verifyOverlayManifest(JSON.parse(fs.readFileSync(path.join(overlay, 'package.json'), 'utf8')));
  const store = path.join(root, 'node_modules/.pnpm');
  const entries = fs.readdirSync(store);
  const nodes = entries.filter(name => name.startsWith('n8n-nodes-base@'));
  if (nodes.length !== 1) throw new Error('NODES_BASE_DRIFT');
  const gitFile = path.join(store, nodes[0], 'node_modules/n8n-nodes-base/dist/nodes/Git/Git.node.js');
  const source = fs.readFileSync(gitFile, 'utf8');
  if (crypto.createHash('sha256').update(source).digest('hex') !== GIT_SOURCE_SHA256) {
    throw new Error('GIT_SOURCE_HASH_MISMATCH');
  }
  const adapted = adaptGitNode(source);
  const consumerPatches = [
    { file: gitFile, adapted },
    { file: path.join(root, 'dist/modules/source-control.ee/source-control-git.service.ee.js'), hash: SOURCE_CONTROL_SHA256, adapt: adaptSourceControl },
    { file: path.join(root, 'dist/modules/promotions.ee/promotions-git.service.js'), hash: PROMOTIONS_SHA256, adapt: adaptPromotions },
  ];
  for (const patch of consumerPatches.slice(1)) {
    const text = fs.readFileSync(patch.file, 'utf8');
    if (crypto.createHash('sha256').update(text).digest('hex') !== patch.hash) throw new Error('GIT_SOURCE_HASH_MISMATCH');
    patch.adapted = patch.adapt(text);
  }
  const replacements = [];
  for (const [name, version] of Object.entries(VERSION_PINS)) {
    const target = path.join(overlay, 'node_modules', name);
    const installed = JSON.parse(fs.readFileSync(path.join(target, 'package.json'), 'utf8'));
    if (installed.version !== version) throw new Error(`INSTALLED_VERSION: ${name}`);
    const prefix = `${name.replace('/', '+')}@`;
    const copies = entries.filter(entry => entry.startsWith(prefix));
    if (copies.length !== 1) throw new Error(`PACKAGE_LAYOUT_DRIFT: ${name}`);
    replacements.push({ old: path.join(store, copies[0], 'node_modules', name), target });
  }
  // A vendor change must fail the build before files are modified.
  for (const patch of consumerPatches) fs.writeFileSync(patch.file, patch.adapted);
  for (const replacement of replacements) {
    fs.rmSync(replacement.old, { recursive: true, force: false });
    fs.cpSync(replacement.target, replacement.old, { recursive: true, dereference: true });
    const nested = path.join(replacement.old, 'node_modules');
    if (fs.existsSync(nested)) throw new Error('OVERLAY_NESTED_DEPENDENCIES_DRIFT');
    fs.symlinkSync(path.join(overlay, 'node_modules'), nested, 'dir');
  }
}

if (require.main === module) hardenRuntime('/usr/local/lib/node_modules/n8n', '/opt/velodrive-security');
module.exports = { adaptGitNode, adaptSourceControl, adaptPromotions, verifyOverlayManifest, hardenRuntime };
