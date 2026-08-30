import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ensureCodegraph, ensureAgentBrowser, initCodegraph, removeCodegraph, removeAgentBrowser } from '../lib/tools.mjs';

test('falha de CLI → false + aviso no stderr (sem rede)', (t) => {
  const mock = t.mock.method(console, 'error', () => {});
  assert.equal(ensureCodegraph({ npmBin: 'binario-fake-inexistente' }), false);
  assert.equal(removeCodegraph({ npmBin: 'binario-fake-inexistente' }), false);
  assert.equal(ensureAgentBrowser({ npmBin: 'binario-fake-inexistente' }), false);
  assert.equal(removeAgentBrowser({ npmBin: 'binario-fake-inexistente' }), false);
  assert.equal(initCodegraph('/tmp', { codegraphBin: 'binario-fake-inexistente' }), false);
  assert.equal(mock.mock.callCount(), 5);
  for (const call of mock.mock.calls) {
    assert.ok(call.arguments[0].startsWith('aviso:'));
  }
});
