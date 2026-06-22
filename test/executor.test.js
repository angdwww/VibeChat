import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { executeRequest } from '../src/executor.js';

async function tempRoot() {
  return mkdtemp(path.join(tmpdir(), 'vibechat-exec-'));
}

test('executes operations in order and includes operation indexes', async () => {
  const cwd = await tempRoot();
  const response = await executeRequest({
    version: 1,
    summary: 'Write then read',
    operations: [
      { type: 'write', path: 'a.txt', content: 'hello' },
      { type: 'read', paths: ['a.txt'] }
    ]
  }, { cwd });

  assert.equal(response.summary, 'Write then read');
  assert.equal(response.results.length, 2);
  assert.equal(response.results[0].index, 1);
  assert.equal(response.results[1].output.files[0].content, 'hello');
});

test('stops on first error by default', async () => {
  const cwd = await tempRoot();
  const response = await executeRequest({
    version: 1,
    summary: 'Stop after a failed read',
    operations: [
      { type: 'read', paths: ['missing.txt'] },
      { type: 'write', path: 'later.txt', content: 'no' }
    ]
  }, { cwd });

  assert.equal(response.results.length, 1);
  assert.equal(response.results[0].ok, false);
});

test('continues after errors when continueOnError is true', async () => {
  const cwd = await tempRoot();
  const response = await executeRequest({
    version: 1,
    summary: 'Continue after a failed read',
    continueOnError: true,
    operations: [
      { type: 'read', paths: ['missing.txt'] },
      { type: 'write', path: 'later.txt', content: 'yes' }
    ]
  }, { cwd });

  assert.equal(response.results.length, 2);
  assert.equal(response.results[0].ok, false);
  assert.equal(response.results[1].ok, true);
});

test('reports each completed operation through the execution callback', async () => {
  const cwd = await tempRoot();
  const streamed = [];

  const response = await executeRequest({
    version: 1,
    summary: 'Stream operation results',
    operations: [
      { type: 'note', message: 'first' },
      { type: 'write', path: 'streamed.txt', content: 'second' }
    ]
  }, {
    cwd,
    onResult: async (result) => streamed.push(result)
  });

  assert.deepEqual(streamed.map((result) => result.index), [1, 2]);
  assert.equal(streamed[0].output.message, 'first');
  assert.equal(streamed[1].output.path, 'streamed.txt');
  assert.deepEqual(response.results, streamed);
});
