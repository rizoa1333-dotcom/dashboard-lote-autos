const test = require('node:test');
const assert = require('node:assert/strict');
const { beginSubmit } = require('../../ui-feedback');

function fakeElement(textContent = '') {
  const attributes = new Map();
  return {
    textContent,
    disabled: false,
    dataset: {},
    setAttribute(key, value) { attributes.set(key, value); },
    getAttribute(key) { return attributes.get(key) || null; },
    removeAttribute(key) { attributes.delete(key); }
  };
}

test('double submit is locked and loading state is announced accessibly', () => {
  const button = fakeElement('Guardar');
  const status = fakeElement('');
  const finish = beginSubmit(button, status, 'Guardando…', 'Guardando el vehículo…');
  assert.equal(typeof finish, 'function');
  assert.equal(beginSubmit(button, status, 'Guardando…', 'Guardando el vehículo…'), null);
  assert.equal(button.disabled, true);
  assert.equal(button.getAttribute('aria-busy'), 'true');
  assert.equal(status.textContent, 'Guardando el vehículo…');
  assert.equal(status.getAttribute('aria-live'), 'polite');
  assert.equal(status.dataset.state, 'loading');
});

test('al completar restaura el botón y anuncia éxito; se puede iniciar otro guardado', () => {
  const button = fakeElement('Guardar');
  const status = fakeElement('');
  const finish = beginSubmit(button, status, 'Guardando…', 'Guardando…');
  finish('Vehículo agregado.', 'success');
  assert.equal(button.disabled, false);
  assert.equal(button.textContent, 'Guardar');
  assert.equal(button.getAttribute('aria-busy'), null);
  assert.equal(status.textContent, 'Vehículo agregado.');
  assert.equal(status.getAttribute('role'), 'status');
  assert.equal(beginSubmit(button, status, 'Guardando…', 'Guardando…') instanceof Function, true);
});

test('fallo por desconexión produce alerta accesible y desbloquea el botón para reintentar', () => {
  const button = fakeElement('Guardar');
  const status = fakeElement('');
  const finish = beginSubmit(button, status, 'Guardando…', 'Guardando…');
  finish('No se pudo guardar. Revisa tu conexión.', 'error');
  assert.equal(button.disabled, false);
  assert.equal(button.getAttribute('aria-busy'), null);
  assert.equal(status.getAttribute('role'), 'alert');
  assert.equal(status.dataset.state, 'error');
});
