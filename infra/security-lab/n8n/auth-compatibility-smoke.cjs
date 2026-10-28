const assert = require('node:assert/strict');
const fs = require('node:fs');
const { planPackageSlots } = require('/opt/velodrive-security/harden-runtime.cjs');
const store = '/usr/local/lib/node_modules/n8n/node_modules/.pnpm';
const tenant = '11111111-2222-3333-4444-555555555555';
const clientId = '22222222-3333-4444-5555-666666666666';
const host = 'https://login.microsoftonline.com';
const scopes = ['api://qa/.default'];
const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');

async function verifyClient(slot) {
  const msal = require(`${store}/${slot.directory}/node_modules/@azure/msal-node`);
  const requests = [];
  let rejectToken = false;
  const networkClient = {
    async sendGetRequestAsync() { throw Error('UNEXPECTED_DISCOVERY_REQUEST'); },
    async sendPostRequestAsync(url, options) {
      const endpoint = new URL(url);
      assert.equal(endpoint.origin, host);
      assert.equal(endpoint.pathname, `/${tenant}/oauth2/v2.0/token`);
      const params = new URLSearchParams(options.body);
      assert.equal(params.get('client_id'), clientId);
      assert.equal(params.get('client_secret'), 'LOCAL-QA-NOT-A-REAL-SECRET');
      const grant = params.get('grant_type');
      requests.push(grant);
      if (rejectToken) return { status: 401, headers: {}, body: { error: 'invalid_client', error_description: 'Local QA rejection' } };
      return { status: 200, headers: {}, body: { access_token: grant === 'client_credentials' ? 'qa-client-token' : 'qa-obo-token', token_type: 'Bearer', expires_in: 3600, ext_expires_in: 3600, scope: scopes.join(' ') } };
    },
  };
  const config = {
    auth: {
      clientId, clientSecret: 'LOCAL-QA-NOT-A-REAL-SECRET', authority: `${host}/${tenant}`,
      authorityMetadata: JSON.stringify({ authorization_endpoint: `${host}/${tenant}/oauth2/v2.0/authorize`, token_endpoint: `${host}/${tenant}/oauth2/v2.0/token`, issuer: `${host}/${tenant}/v2.0`, jwks_uri: `${host}/${tenant}/discovery/v2.0/keys` }),
      cloudDiscoveryMetadata: JSON.stringify({ tenant_discovery_endpoint: `${host}/${tenant}/v2.0/.well-known/openid-configuration`, metadata: [{ preferred_network: 'login.microsoftonline.com', preferred_cache: 'login.microsoftonline.com', aliases: ['login.microsoftonline.com', 'login.windows.net', 'sts.windows.net'] }] }),
    },
    system: { networkClient, loggerOptions: { loggerCallback() {}, piiLoggingEnabled: false } },
  };
  const client = new msal.ConfidentialClientApplication(config);
  const first = await client.acquireTokenByClientCredential({ scopes });
  assert.equal(first.accessToken, 'qa-client-token');
  assert.equal(first.fromCache, false);
  const cached = await client.acquireTokenByClientCredential({ scopes });
  assert.equal(cached.accessToken, first.accessToken);
  assert.equal(cached.fromCache, true);
  assert.equal(requests.length, 1);
  const restored = new msal.ConfidentialClientApplication(config);
  restored.getTokenCache().deserialize(client.getTokenCache().serialize());
  const restoredToken = await restored.acquireTokenByClientCredential({ scopes });
  assert.equal(restoredToken.fromCache, true);
  assert.equal(restoredToken.accessToken, first.accessToken);
  assert.equal(requests.length, 1);
  const assertion = `${encode({ alg: 'none', typ: 'JWT' })}.${encode({ aud: clientId, tid: tenant, sub: 'local-qa' })}.QA`;
  const obo = await client.acquireTokenOnBehalfOf({ scopes, oboAssertion: assertion });
  assert.equal(obo.accessToken, 'qa-obo-token');
  assert.ok(requests.includes('urn:ietf:params:oauth:grant-type:jwt-bearer'));
  rejectToken = true;
  await assert.rejects(() => client.acquireTokenByClientCredential({ scopes, skipCache: true }), /invalid_client/);
  assert.equal(typeof msal.ManagedIdentityApplication, 'function');
}

async function main() {
  const entries = fs.readdirSync(store);
  const targets = planPackageSlots(entries).filter(slot => slot.packageName === '@azure/msal-node');
  assert.equal(targets.length, 2);
  for (const slot of targets) await verifyClient(slot);
  const legacy = entries.find(name => name.startsWith('@azure+msal-node@3.8.4'));
  assert.ok(legacy);
  assert.equal(JSON.parse(fs.readFileSync(`${store}/${legacy}/node_modules/@azure/msal-node/package.json`, 'utf8')).version, '3.8.4');
  assert.equal(JSON.parse(fs.readFileSync('/opt/velodrive-security/node_modules/@azure/msal-common/package.json', 'utf8')).version, '16.14.2');
  console.log(JSON.stringify({ patchedConsumers: 2, clientCredentials: true, tokenCache: true, onBehalfOf: true, invalidClientRejected: true, legacyMsal3Preserved: true, transport: 'in-memory mock; no network' }));
}
main().catch(error => { console.error(error.stack); process.exitCode = 1; });
