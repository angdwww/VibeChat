import test from 'node:test';
import assert from 'node:assert/strict';
import { copyToClipboard } from '../src/clipboard.js';

test('reports clipboard success when adapter write succeeds', async () => {
  const result = await copyToClipboard('hello', { write: async () => undefined });
  assert.deepEqual(result, { ok: true });
});

test('reports clipboard failure without throwing', async () => {
  const result = await copyToClipboard('hello', {
    write: async () => {
      throw new Error('no clipboard');
    }
  });
  assert.equal(result.ok, false);
  assert.match(result.error, /no clipboard/);
});
