const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { patch: patchMcp } = require('./mcp-patches.cjs');

const GIT_SOURCE_SHA256 = '4f83e5249d7d69e796e2cc1ccf55d732ee429e14041623e4c55207693474eb44';
const SOURCE_CONTROL_SHA256 = '69400823fe736395e4a7f5d7900156ff227bd1efcc0db7317f130369cfa5d155';
const PROMOTIONS_SHA256 = '6ed0d413363b14b72e45eb6444ed797ffe72f0e77a0a1a8ba04c7de328fb3922';
const VERSION_PINS = Object.freeze({ 'simple-git': '4.0.2', handlebars: '4.7.10', '@simple-git/argv-parser': '2.0.1',
  'body-parser': '2.4.0', 'follow-redirects': '1.16.1', multer: '2.5.0', 'undici-v6': 'npm:undici@6.29.1', 'undici-v7': 'npm:undici@7.30.1',
  toml: '5.0.1', '@azure/msal-node': '7.1.0', '@azure/msal-common': '16.14.2',
  '@modelcontextprotocol/sdk': '1.32.0', '@modelcontextprotocol/server': '2.3.0', '@modelcontextprotocol/core': '2.3.0', '@modelcontextprotocol/node': '2.1.0', zod: '4.6.6' });
const PACKAGE_SLOTS = Object.freeze([
  {packageName:'simple-git',prefix:'simple-git@',overlayName:'simple-git',version:'4.0.2',copies:1},
  {packageName:'handlebars',prefix:'handlebars@',overlayName:'handlebars',version:'4.7.10',copies:1},
  {packageName:'@simple-git/argv-parser',prefix:'@simple-git+argv-parser@',overlayName:'@simple-git/argv-parser',version:'2.0.1',copies:1},
  {packageName:'body-parser',prefix:'body-parser@',overlayName:'body-parser',version:'2.4.0',copies:1},
  {packageName:'multer',prefix:'multer@',overlayName:'multer',version:'2.5.0',copies:1},
  {packageName:'follow-redirects',prefix:'follow-redirects@',overlayName:'follow-redirects',version:'1.16.1',copies:2},
  {packageName:'undici',prefix:'undici@6.',overlayName:'undici-v6',version:'6.29.1',copies:1},
  {packageName:'undici',prefix:'undici@7.',overlayName:'undici-v7',version:'7.30.1',copies:1},
  {packageName:'toml',prefix:'toml@',overlayName:'toml',version:'5.0.1',copies:1},
  {packageName:'@azure/msal-node',prefix:'@azure+msal-node@5.',overlayName:'@azure/msal-node',version:'7.1.0',copies:2},
  {packageName:'@modelcontextprotocol/sdk',prefix:'@modelcontextprotocol+sdk@',overlayName:'@modelcontextprotocol/sdk',version:'1.32.0',copies:1},
  {packageName:'@modelcontextprotocol/server',prefix:'@modelcontextprotocol+server@',overlayName:'@modelcontextprotocol/server',version:'2.3.0',copies:1},
  {packageName:'@modelcontextprotocol/core',prefix:'@modelcontextprotocol+core@',overlayName:'@modelcontextprotocol/core',version:'2.3.0',copies:1},
  {packageName:'@modelcontextprotocol/node',prefix:'@modelcontextprotocol+node@',overlayName:'@modelcontextprotocol/node',version:'2.1.0',copies:1},
]);

function planPackageSlots(entries) {
  return PACKAGE_SLOTS.flatMap(slot => {
    const directories = entries.filter(entry => entry.startsWith(slot.prefix));
    if (directories.length !== slot.copies) throw new Error(`PACKAGE_LAYOUT_DRIFT: ${slot.packageName}`);
    return directories.map(directory => ({ ...slot, directory }));
  });
}

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
  const vendorVersion = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
  if (!['2.44.6','2.45.4'].includes(vendorVersion)) throw new Error('UNREVIEWED_VENDOR_VERSION');
  const store = path.join(root, 'node_modules/.pnpm');
  const entries = fs.readdirSync(store);
  const nodes = entries.filter(name => name.startsWith('n8n-nodes-base@'));
  if (nodes.length !== 1) throw new Error('NODES_BASE_DRIFT');
  const gitFile = path.join(store, nodes[0], 'node_modules/n8n-nodes-base/dist/nodes/Git/Git.node.js');
  const source = fs.readFileSync(gitFile, 'utf8');
  const gitHash = vendorVersion === '2.45.4' ? '04a45bb1048744bd95a69cc62fffc3e125555e8572fdce8875abcf31499c3e3b' : GIT_SOURCE_SHA256;
  if (crypto.createHash('sha256').update(source).digest('hex') !== gitHash) {
    throw new Error('GIT_SOURCE_HASH_MISMATCH');
  }
  const adapted = vendorVersion === '2.45.4' ? source : adaptGitNode(source);
  const consumerPatches = [
    { file: gitFile, adapted },
    { file: path.join(root, 'dist/modules/source-control.ee/source-control-git.service.ee.js'), hash: vendorVersion === '2.45.4' ? '9fafc0c69f7402aca0814b566596e3ba5275361ffec4b3b32caff911d1dac667' : SOURCE_CONTROL_SHA256, adapt: adaptSourceControl },
    { file: path.join(root, 'dist/modules/promotions.ee/promotions-git.service.js'), hash: vendorVersion === '2.45.4' ? 'e49172c5ba00809a955e864c979d8da1008b8131491b2dfc6a2c253e754860de' : PROMOTIONS_SHA256, adapt: adaptPromotions },
  ];
  for (const patch of consumerPatches.slice(1)) {
    const text = fs.readFileSync(patch.file, 'utf8');
    if (crypto.createHash('sha256').update(text).digest('hex') !== patch.hash) throw new Error('GIT_SOURCE_HASH_MISMATCH');
    patch.adapted = vendorVersion === '2.45.4' ? text : patch.adapt(text);
  }
  if (vendorVersion !== '2.45.4') throw new Error('MCP_VENDOR_VERSION_UNSUPPORTED');
  const langchain = entries.filter(name => name.startsWith('@n8n+n8n-nodes-langchain@'));
  if (langchain.length !== 1) throw new Error('MCP_LANGCHAIN_LAYOUT_DRIFT');
  const triggerRoot = path.join(store, langchain[0], 'node_modules/@n8n/n8n-nodes-langchain/dist/nodes/mcp/McpTrigger');
  const mcpFiles = [
    ['service', path.join(root, 'dist/modules/mcp/mcp.service.js')],
    ['controller', path.join(root, 'dist/modules/mcp/mcp.controller.js')],
    ['trigger', path.join(triggerRoot, 'McpServer.js')],
    ['entry', path.join(triggerRoot, 'McpTrigger.node.js')],
  ];
  for (const [kind, file] of mcpFiles) consumerPatches.push({ file, adapted: patchMcp(kind, fs.readFileSync(file, 'utf8')) });
  const legacyZod = path.join(store, 'zod@3.25.76/node_modules/zod');
  if (JSON.parse(fs.readFileSync(path.join(legacyZod, 'package.json'), 'utf8')).version !== '3.25.76') throw new Error('LEGACY_ZOD_LAYOUT_DRIFT');
  const replacements = [];
  for (const slot of planPackageSlots(entries)) {
    const { packageName: name, version } = slot;
    const target = path.join(overlay, 'node_modules', slot.overlayName);
    const installed = JSON.parse(fs.readFileSync(path.join(target, 'package.json'), 'utf8'));
    if (installed.version !== version) throw new Error(`INSTALLED_VERSION: ${name}`);
    if (installed.name !== name) throw new Error(`INSTALLED_PACKAGE_NAME: ${name}`);
    replacements.push({ old: path.join(store, slot.directory, 'node_modules', name), target });
  }
  // A vendor change must fail the build before files are modified.
  for (const patch of consumerPatches) fs.writeFileSync(patch.file, patch.adapted);
  for (const replacement of replacements) {
    fs.rmSync(replacement.old, { recursive: true, force: false });
    fs.cpSync(replacement.target, replacement.old, { recursive: true, dereference: true });
    const nested = path.join(replacement.old, 'node_modules');
    fs.mkdirSync(nested, { recursive: true });
    const sharedModules = path.join(overlay, 'node_modules');
    const linkDependency = (name, parent) => {
      const destination = path.join(parent, name);
      if (!fs.existsSync(destination)) fs.symlinkSync(path.join(sharedModules, path.relative(nested, destination)), destination, 'dir');
    };
    for (const entry of fs.readdirSync(sharedModules, { withFileTypes: true })) {
      if (entry.name.startsWith('.')) continue;
      if (entry.name.startsWith('@')) {
        const scope = path.join(nested, entry.name);
        fs.mkdirSync(scope, { recursive: true });
        for (const dependency of fs.readdirSync(path.join(sharedModules, entry.name))) linkDependency(dependency, scope);
      } else linkDependency(entry.name, nested);
    }
    // SDK v1 must retain n8n's Zod v3 schemas; server/core v2 use their fixed v4 peer.
    if (path.basename(replacement.old) === 'sdk' && replacement.old.includes('@modelcontextprotocol')) {
      const zodLink = path.join(nested, 'zod');
      fs.rmSync(zodLink, { recursive: true, force: true });
      fs.symlinkSync(legacyZod, zodLink, 'dir');
    }
  }
}

if (require.main === module) hardenRuntime('/usr/local/lib/node_modules/n8n', '/opt/velodrive-security');
module.exports = { adaptGitNode, adaptSourceControl, adaptPromotions, verifyOverlayManifest, hardenRuntime, planPackageSlots };
