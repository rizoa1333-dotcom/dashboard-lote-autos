const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { adaptGitNode, adaptSourceControl, adaptPromotions, verifyOverlayManifest, hardenRuntime } = require('../../infra/security-lab/n8n/harden-runtime.cjs');

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
    fs.mkdirSync(overlay);
    const source = 'module.exports = { unrelated: true };';
    fs.writeFileSync(gitFile, source);
    fs.writeFileSync(path.join(overlay, 'package.json'), JSON.stringify({ dependencies: {
      'simple-git': '4.0.2', handlebars: '4.7.10', '@simple-git/argv-parser': '2.0.1',
    } }));
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
  const manifest = { dependencies: { 'simple-git': '4.0.2', handlebars: '4.7.10', '@simple-git/argv-parser': '2.0.1' } };
  assert.equal(verifyOverlayManifest(manifest), true);
  for (const version of ['4.0.1', '^4.0.2', '3.36.0']) {
    assert.throws(() => verifyOverlayManifest({ dependencies: { ...manifest.dependencies, 'simple-git': version } }), /OVERLAY_VERSION/);
  }
  assert.throws(() => verifyOverlayManifest({ dependencies: { ...manifest.dependencies, handlebars: '4.7.9' } }), /OVERLAY_VERSION/);
  assert.throws(() => verifyOverlayManifest({ dependencies: { ...manifest.dependencies, '@simple-git/argv-parser': '2.0.0' } }), /OVERLAY_VERSION/);
});
