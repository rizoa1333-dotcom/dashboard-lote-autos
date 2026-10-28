const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { adaptGitNode, adaptSourceControl, adaptPromotions, verifyOverlayManifest, hardenRuntime, planPackageSlots } = require('../../infra/security-lab/n8n/harden-runtime.cjs');
const completeManifest = require('../../infra/security-lab/n8n/package.json');

test('n8n Git adapter uses the named API without changing other defaults', () => {
  const source = 'const simple_git_1 = __importDefault(require("simple-git"));\nconst git = (0, simple_git_1.default)(gitOptions).env(cleanEnv);\n';
  const actual = adaptGitNode(source);
  assert.match(actual, /const simple_git_1 = require\("simple-git"\)/);
  assert.match(actual, /simple_git_1.simpleGit/);
  assert.doesNotMatch(actual, /simple_git_1.default/);
  assert.match(actual, /allowEnvironment: \['GIT_TERMINAL_PROMPT', 'GIT_ALLOW_PROTOCOL'\]/);
  assert.doesNotMatch(actual, /allowEnvironment: true/);
});

test('source control and promotions explicitly allow only their application-owned Git environment', () => {
  for (const [adapt, source] of [
    [adaptSourceControl, 'this.gitOptions = {\nbaseDir: gitFolder,\n};'],
    [adaptPromotions, 'const BASE_GIT_OPTIONS = {\nbinary: "git",\n};'],
  ]) {
    const result = adapt(source);
    assert.match(result, /allowEnvironment: \['GIT_TERMINAL_PROMPT', 'GIT_SSH_COMMAND', 'N8N_GIT_USERNAME', 'N8N_GIT_PASSWORD'\]/);
    assert.throws(() => adapt('unexpected source'), /GIT_CONSUMER_DRIFT/);
  }
});

test('n8n runtime rejects a different vendor source before changing files', () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'velodrive-n8n-overlay-'));
  try {
    const root = path.join(temporary, 'runtime');
    const overlay = path.join(temporary, 'overlay');
    const gitFile = path.join(root, 'node_modules/.pnpm/n8n-nodes-base@test/node_modules/n8n-nodes-base/dist/nodes/Git/Git.node.js');
    fs.mkdirSync(path.dirname(gitFile), { recursive: true });
    fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({version:'2.44.6'}));
    fs.mkdirSync(overlay);
    const source = 'module.exports = { unrelated: true };';
    fs.writeFileSync(gitFile, source);
    fs.writeFileSync(path.join(overlay, 'package.json'), JSON.stringify(completeManifest));
    assert.throws(() => hardenRuntime(root, overlay), /GIT_SOURCE_HASH_MISMATCH/);
    assert.equal(fs.readFileSync(gitFile, 'utf8'), source);
    assert.deepEqual(fs.readdirSync(overlay), ['package.json']);
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
});

test('n8n Git adapter rejects upstream changes rather than silently patching', () => {
  assert.throws(() => adaptGitNode('module.exports = {};'), /GIT_CONSUMER_DRIFT/);
  assert.throws(() => adaptGitNode('const simple_git_1 = __importDefault(require("simple-git"));'), /GIT_CONSUMER_DRIFT/);
});

test('n8n overlay requires corrected exact package versions', () => {
  const manifest = structuredClone(completeManifest);
  assert.equal(verifyOverlayManifest(manifest), true);
  for (const version of ['4.0.1', '^4.0.2', '3.36.0']) {
    assert.throws(() => verifyOverlayManifest({ dependencies: { ...manifest.dependencies, 'simple-git': version } }), /OVERLAY_VERSION/);
  }
  assert.throws(() => verifyOverlayManifest({ dependencies: { ...manifest.dependencies, handlebars: '4.7.9' } }), /OVERLAY_VERSION/);
  assert.throws(() => verifyOverlayManifest({ dependencies: { ...manifest.dependencies, '@simple-git/argv-parser': '2.0.0' } }), /OVERLAY_VERSION/);
});

test('HTTP patch replaces both redirect copies and keeps Undici 6 and 7 separate', () => {
  const entries = ['simple-git@3.36.0_supports-color@8.1.1','handlebars@4.7.9','@simple-git+argv-parser@1.1.1',
    'body-parser@2.3.0_supports-color@8.1.1','multer@2.3.0','follow-redirects@1.16.0_debug@4.3.4','follow-redirects@1.16.0_debug@4.4.3',
    'undici@6.29.0','undici@7.29.1','toml@4.2.0','@azure+msal-node@3.8.4','@azure+msal-node@5.1.5','@azure+msal-node@5.6.0',
    '@modelcontextprotocol+sdk@1.31.0_zod@3.25.76','@modelcontextprotocol+server@2.0.0','@modelcontextprotocol+core@2.0.0',
    '@modelcontextprotocol+node@2.0.0_server@2.0.0','zod@3.25.76'];
  const slots = planPackageSlots(entries);
  assert.equal(slots.filter(slot=>slot.packageName==='follow-redirects').length,2);
  assert.equal(slots.find(slot=>slot.directory==='undici@6.29.0').overlayName,'undici-v6');
  assert.equal(slots.find(slot=>slot.directory==='undici@7.29.1').overlayName,'undici-v7');
  assert.equal(slots.filter(slot=>slot.packageName==='@azure/msal-node').length,2);
  assert.equal(slots.find(slot=>slot.directory==='@azure+msal-node@3.8.4'),undefined);
  assert.equal(slots.find(slot=>slot.packageName==='toml').version,'5.0.1');
  assert.equal(slots.find(slot=>slot.packageName==='@modelcontextprotocol/sdk').version,'1.32.0');
  assert.equal(slots.find(slot=>slot.packageName==='@modelcontextprotocol/server').version,'2.3.0');
  assert.equal(slots.find(slot=>slot.packageName==='@modelcontextprotocol/core').version,'2.3.0');
  assert.equal(slots.find(slot=>slot.packageName==='@modelcontextprotocol/node').version,'2.1.0');
  assert.equal(slots.find(slot=>slot.packageName==='zod'),undefined);
  assert.throws(()=>planPackageSlots(entries.filter(entry=>!entry.includes('debug@4.4.3'))),/PACKAGE_LAYOUT_DRIFT/);
  assert.throws(()=>planPackageSlots([...entries,'undici@6.30.0']),/PACKAGE_LAYOUT_DRIFT/);
});
