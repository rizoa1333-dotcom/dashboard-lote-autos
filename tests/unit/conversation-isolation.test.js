const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const workflow = require('../../VeloDrive-n8n-intervencion-automatica.json');
const expression = workflow.nodes.find(n => n.name === 'Simple Memory1').parameters.sessionKey;
const lotA = '38fc2094-ce52-4e6a-9c42-69db7725d65f';
const lotB = '00000000-0000-4000-8000-000000000001';
function session(lot, phone, input = {}) {
  const rows = {
    'Edit Fields1': { tenant_lote_id: lot },
    'Preparar identidad del mensaje': { phone_number: phone },
  };
  return expression.slice(1).replace(/\{\{([\s\S]*?)\}\}/g, (_, code) => vm.runInNewContext(code, {
    $json: input,
    $: name => ({ first: () => ({ json: rows[name] }), item: { json: rows[name] } }),
  }));
}
test('dos teléfonos del mismo lote nunca comparten memoria aunque la entrada no tenga body', () => {
  const a = session(lotA, '3121111111');
  const b = session(lotA, '3122222222');
  assert.notEqual(a, b);
  assert.ok(a.includes(lotA) && a.includes('3121111111'));
});
test('el mismo teléfono en lotes distintos nunca comparte memoria', () => {
  assert.notEqual(session(lotA, '3121111111'), session(lotB, '3121111111'));
});
test('los datos del nodo anterior no pueden sustituir la identidad validada', () => {
  assert.equal(session(lotA, '3121111111'), session(lotA, '3121111111', {
    body: { key: { remoteJid: '3129999999@s.whatsapp.net' } },
    phone_number: '3129999999', lote_id: lotB,
  }));
});
test('identidad ausente o inválida falla cerrada y nunca usa una sesión compartida', () => {
  for (const [lot, phone] of [[lotA, ''], ['', '3121111111'], [lotA, undefined], [lotA, 'undefined'], [lotB+'x', '3121111111']]) {
    assert.throws(() => session(lot, phone));
  }
});
