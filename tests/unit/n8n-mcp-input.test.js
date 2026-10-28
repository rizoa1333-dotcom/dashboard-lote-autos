const test = require('node:test');
const assert = require('node:assert/strict');
const { rejectOversizedMcpToolInput: guard } = require('../../infra/security-lab/n8n/mcp-input-guard.cjs');

function response() {
  return { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(value) { this.body = value; return this; } };
}
function nested(depth) {
  const root = {};
  let value = root;
  for (let index = 0; index < depth; index++) { value.next = {}; value = value.next; }
  return root;
}
function tool(args) { return { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'echo', arguments: args } }; }

test('MCP guards the complete envelope before transport serialization', () => {
  for (const body of [
    { method: 'ping', params: nested(20000) },
    { ...tool({}), params: { name: 'echo', arguments: {}, _meta: nested(20000) } },
    { method: 'initialize', params: { extra: Array(20001).fill(1) } },
  ]) {
    const res = response();
    assert.equal(guard({ body }, res), true);
    assert.equal(res.statusCode, 400);
    assert.ok(JSON.stringify(res.body).length < 512);
  }
});

test('MCP preserves the exact tool budget and rejects before executing schemas', () => {
  assert.equal(guard({ body: tool({ items: Array(9999).fill('x') }) }, response()), false);
  assert.equal(guard({ body: tool({ items: Array(10000).fill('x') }) }, response()), true);
  assert.equal(guard({ body: tool(nested(64)) }, response()), false);
  assert.equal(guard({ body: tool(nested(65)) }, response()), true);
});

test('MCP limits raw bytes before JSON parsing and never reflects oversized ids', () => {
  const original = JSON.parse;
  JSON.parse = () => { throw new Error('PARSER_MUST_NOT_RUN'); };
  try { assert.equal(guard({ rawBody: Buffer.alloc(16 * 1024 * 1024 + 1) }, response()), true); }
  finally { JSON.parse = original; }
  const res = response();
  assert.equal(guard({ body: { ...tool(nested(65)), id: 'x'.repeat(1024) } }, res), true);
  assert.equal(res.body.id, null);
  const escaped = response();
  guard({ body: { ...tool(nested(65)), id: '\u0000'.repeat(256) } }, escaped);
  assert.ok(JSON.stringify(escaped.body).length < 512);
});

test('MCP rejects oversized arrays without enumerating their indices', () => {
  const items = new Proxy(Array(1000000).fill(0), { ownKeys() { throw new Error('INDICES_MUST_NOT_BE_MATERIALIZED'); } });
  assert.equal(guard({ body: tool({ items }) }, response()), true);
});

test('MCP applies the aggregate budget across batches and bounds decoded fallback bodies', () => {
  const batch = Array.from({ length: 100 }, () => tool({ items: Array(99).fill('x') }));
  assert.equal(guard({ body: batch }, response()), false);
  batch[99].params.arguments.items.push('overflow');
  assert.equal(guard({ body: batch }, response()), true);
  assert.equal(guard({ body: Array.from({ length: 101 }, () => ({ method: 'ping' })) }, response()), true);
  assert.equal(guard({ rawBody: Buffer.from([0x1f, 0x8b]), body: tool({ items: Array(10000).fill('x') }) }, response()), true);
  const res = response();
  assert.equal(guard({ body: { method: 'initialize', params: { value: 'x'.repeat(16 * 1024 * 1024 + 1) } } }, res), true);
  assert.equal(res.statusCode, 413);
  assert.equal(guard({ rawBody: 'invalid-json' }, response()), false);
});
