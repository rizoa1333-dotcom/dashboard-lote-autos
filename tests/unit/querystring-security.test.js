'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const consumers = ['express', 'body-parser'];
const copies = new Map();
for (const consumer of consumers) {
  const root = path.dirname(require.resolve(`${consumer}/package.json`));
  const resolved = require.resolve('qs', { paths: [root] });
  copies.set(resolved, require(resolved));
}

test('runtime query-string consumers tolerate hostile comma-array elements', () => {
  for (const [modulePath, qs] of copies) {
    const inputs = [
      JSON.parse('{"a":[{"toString":"x"}]}'),
      qs.parse('a[0][toString]=x', { allowPrototypes: true }),
      qs.parse('a[][b]=c', { plainObjects: true }),
    ];
    for (const [index, input] of inputs.entries()) {
      for (const encodeValuesOnly of [false, true]) {
        let result;
        assert.doesNotThrow(() => {
          result = qs.stringify(input, { arrayFormat: 'comma', encodeValuesOnly });
        }, `${path.relative(process.cwd(), modulePath)}; input ${index}; encodeValuesOnly=${encodeValuesOnly}`);
        assert.equal(typeof result, 'string');
      }
    }
    assert.equal(qs.stringify({ a: ['x', 'y'] }, { arrayFormat: 'comma' }), 'a=x%2Cy');
    assert.deepEqual(qs.parse('filters[status]=disponible&page=2'), {
      filters: { status: 'disponible' }, page: '2',
    });
  }
});
