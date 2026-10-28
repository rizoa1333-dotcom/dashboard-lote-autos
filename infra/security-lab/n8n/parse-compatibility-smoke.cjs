const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { planPackageSlots } = require('/opt/velodrive-security/harden-runtime.cjs');
const store = '/usr/local/lib/node_modules/n8n/node_modules/.pnpm';
const entries = fs.readdirSync(store);
const slot = planPackageSlots(entries).find(item => item.packageName === 'toml');
const toml = require(`${store}/${slot.directory}/node_modules/toml`);
const temporary = fs.mkdtempSync('/tmp/qa-snowflake-');
try {
  const fixture = '[default]\naccount="qa_account"\nuser="qa_user"\nrole="QA_ROLE"\nwarehouse="QA_WAREHOUSE"\nlogin_timeout=60\nclient_session_keep_alive=true\nprivate_key="""QA\\nNOT A REAL PRIVATE KEY"""\n';
  const parsed = toml.parse(fixture);
  assert.equal(parsed.default.account, 'qa_account');
  assert.equal(parsed.default.login_timeout, 60);
  assert.equal(parsed.default.client_session_keep_alive, true);
  assert.equal(parsed.default.private_key, 'QA\nNOT A REAL PRIVATE KEY');
  fs.writeFileSync(path.join(temporary, 'connections.toml'), fixture, { mode: 0o600 });
  process.env.SNOWFLAKE_HOME = temporary;
  const sdk = entries.find(name => name.startsWith('snowflake-sdk@'));
  const reader = require(`${store}/${sdk}/node_modules/snowflake-sdk/dist/lib/configuration/connection_configuration.js`);
  const configuration = reader.loadConnectionConfiguration();
  assert.equal(configuration.account, 'qa_account');
  assert.equal(configuration.username, 'qa_user');
  assert.equal(configuration.loginTimeout, 60);
  assert.equal(configuration.privateKey, 'QA\nNOT A REAL PRIVATE KEY');
  process.env.SNOWFLAKE_DEFAULT_CONNECTION_NAME = 'missing';
  assert.throws(() => reader.loadConnectionConfiguration(), /does not exist/);
  assert.throws(() => toml.parse('[invalid'));
  assert.throws(() => toml.parse('value=9007199254740993'));
  try { toml.parse('__proto__.qaPolluted="yes"'); } catch {}
  assert.equal({}.qaPolluted, undefined);
  console.log(JSON.stringify({ tomlVersion: slot.version, actualSnowflakeReader: true, configurationPreserved: true, malformedRejected: true, unsafeIntegerRejected: true, prototypeUnchanged: true, network: 'none' }));
} finally {
  fs.rmSync(temporary, { recursive: true, force: true });
}
