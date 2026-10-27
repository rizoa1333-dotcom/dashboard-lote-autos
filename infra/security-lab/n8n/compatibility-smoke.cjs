const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { createRequire } = require('node:module');
const root = '/usr/local/lib/node_modules/n8n';
const requireN8n = createRequire(`${root}/package.json`);
const logger = { debug() {}, info() {}, warn() {}, error() {}, scoped() { return this; } };

async function main() {
  const temporary = await fs.mkdtemp('/tmp/velodrive-n8n-compat-');
  try {
    const { simpleGit } = requireN8n('simple-git');
    const git = simpleGit(temporary);
    await git.init();
    await git.addConfig('user.name', 'Local QA');
    await git.addConfig('user.email', 'qa@example.invalid');
    await fs.writeFile(path.join(temporary, 'vehicle.txt'), 'local fixture\n');
    await git.add('vehicle.txt');
    await git.commit('Local compatibility fixture');

    const store = `${root}/node_modules/.pnpm`;
    const entries = await fs.readdir(store);
    const nodesBase = entries.find(name => name.startsWith('n8n-nodes-base@'));
    const gitFile = `${store}/${nodesBase}/node_modules/n8n-nodes-base/dist/nodes/Git/Git.node.js`;
    const { Git } = requireN8n(gitFile);
    const parameters = { operation: 'status', repositoryPath: temporary, options: {}, authentication: 'none' };
    const context = {
      getInputData: () => [{ json: {} }],
      getNodeParameter: (name, _index, fallback) => parameters[name] ?? fallback,
      getNode: () => ({ name: 'Local QA Git', typeVersion: 1, parameters }),
      continueOnFail: () => false,
      helpers: {
        resolvePath: value => fs.realpath(value),
        isFilePathBlocked: value => !path.resolve(value).startsWith(`${temporary}/`) && path.resolve(value) !== temporary,
        returnJsonArray: values => values.map(json => ({ json })),
      },
    };
    const status = await Git.prototype.execute.call(context);
    assert.equal(status[0].length, 1);
    assert.deepEqual(status[0][0].json.modified, []);

    const { PromotionsGitService } = requireN8n(`${root}/dist/modules/promotions.ee/promotions-git.service.js`);
    const promotions = new PromotionsGitService(logger);
    await promotions.validateBranchName('qa/compatible');
    await assert.rejects(() => promotions.validateBranchName('--invalid'));

    const { SourceControlGitService } = requireN8n(`${root}/dist/modules/source-control.ee/source-control-git.service.ee.js`);
    const preferences = {
      getPreferences: () => ({ connectionType: 'https', repositoryUrl: 'https://example.invalid/qa.git' }),
      getDecryptedHttpsCredentials: async () => ({ username: 'qa', password: 'local-fixture-only' }),
    };
    const sourceControl = new SourceControlGitService(logger, {}, preferences);
    await sourceControl.setGitCommand(temporary, temporary);
    assert.equal((await sourceControl.git.status()).isClean(), true);
    const sshPreferences = {
      getPreferences: () => ({ connectionType: 'ssh' }),
      getPrivateKeyPath: async () => path.join(temporary, 'unused-local-key'),
    };
    const sshSourceControl = new SourceControlGitService(logger, {}, sshPreferences);
    await sshSourceControl.setGitCommand(temporary, temporary);
    assert.equal((await sshSourceControl.git.status()).isClean(), true);
    for (const credentials of [
      { authType: 'token', username: 'qa', password: 'local-fixture-only' },
      { authType: 'ssh', privateKey: 'LOCAL_FIXTURE_NOT_A_PRIVATE_KEY' },
    ]) {
      assert.equal(await promotions.withGit({ remoteUrl: 'https://example.invalid/qa.git', credentials, repoDir: temporary, sshDir: temporary }, async client => (await client.status()).isClean()), true);
    }

    const { UserManagementMailer } = requireN8n(`${root}/dist/user-management/email/user-management-mailer.js`);
    const templateDirectory = `${root}/dist/user-management/email/templates`;
    const names = (await fs.readdir(templateDirectory)).filter(name => name.endsWith('.handlebars'));
    assert.ok(names.length > 0);
    for (const name of names) {
      const template = await UserManagementMailer.prototype.getTemplate.call({ templatesCache: {}, templateOverrides: {} }, name.replace(/\.handlebars$/, ''));
      assert.equal(typeof template({ firstName: 'QA', baseUrl: 'https://example.invalid', currentYear: 2026 }), 'string');
    }
    const handlebars = requireN8n('handlebars');
    assert.equal(handlebars.compile('{{value}}')({ value: '<script>' }), '&lt;script&gt;');
    assert.equal(handlebars.compile('{{object.constructor}}')({ object: {} }), '');

    const expressEntry = entries.find(name => name.startsWith('express-handlebars@'));
    assert.ok(expressEntry);
    const engine = requireN8n(`${store}/${expressEntry}/node_modules/express-handlebars`).create();
    const templatePath = path.join(temporary, 'qa.handlebars');
    await fs.writeFile(templatePath, 'Vehicle: {{name}}');
    assert.equal(await engine.render(templatePath, { name: '<QA>' }), 'Vehicle: &lt;QA&gt;');
    const langchain = entries.find(name => name.startsWith('@langchain+classic@'));
    assert.ok(langchain);
    const prompt = requireN8n(`${store}/${langchain}/node_modules/@langchain/classic/dist/experimental/prompts/handlebars.cjs`);
    assert.equal(prompt.interpolateHandlebars('Vehicle: {{name}}', { name: 'QA' }), 'Vehicle: QA');
    assert.ok(prompt.parseHandlebars('Vehicle: {{name}}').some(part => part.type === 'variable' && part.name === 'name'));
    console.log(JSON.stringify({ gitNode: true, promotions: true, sourceControl: true, httpsAndSshEnvironment: true, mailTemplates: names.length, expressHandlebars: true, langchainHandlebars: true, escaping: true, network: 'none' }));
  } finally {
    await fs.rm(temporary, { recursive: true, force: true });
  }
}

main().catch(error => {
  console.error(error.stack);
  if (error.description) console.error('Description:', error.description);
  if (error.cause) console.error('Cause:', error.cause.stack || error.cause.message);
  process.exitCode = 1;
});
